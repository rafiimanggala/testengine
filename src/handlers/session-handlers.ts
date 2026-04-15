// src/handlers/session-handlers.ts
import { execFile } from 'child_process';
import { rewriteUrl } from '../url-rewriter.js';
import type { HandlerContext, ToolHandler, ToolResult } from './types.js';

export function createSessionHandlers(ctx: HandlerContext): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // session_create
  handlers.set('session_create', async (args): Promise<ToolResult> => {
    const { session_id: id, url, mode } = args as { session_id: string; url: string; mode?: string };
    if (!ctx.sessionIdRegex.test(id)) {
      return { content: [{ type: 'text', text: `Invalid session ID "${id}". Must match [a-zA-Z0-9][a-zA-Z0-9_-]{0,62}.` }], isError: true };
    }
    const sessionMode = (mode as 'headless' | 'visible') ?? 'headless';
    const session = await ctx.sessionManager.create(id, url, sessionMode);
    await ctx.browserBridge.connect(id);
    const container = ctx.sessionManager.getPool().getContainer(id);
    if (container) ctx.healthMonitor.register(id, container);
    const rewritten = rewriteUrl(url);
    await ctx.browserBridge.navigate(id, rewritten);

    if (sessionMode === 'visible') {
      try {
        const page = ctx.browserBridge.getPage(id);
        const viewerPort = await ctx.screencastRelay.start(id, page);
        session.viewerPort = viewerPort;
        const child = execFile(ctx.viewerBinary, ['--session', id, '--ws', `ws://localhost:${viewerPort}`], (err) => {
          if (err) console.error(`Viewer launch failed for "${id}": ${err.message}`);
        });
        ctx.viewerProcesses.set(id, child);
        return { content: [{ type: 'text', text: `Session "${id}" created (visible). URL: ${rewritten}, Port: ${session.port}, Viewer: ws://localhost:${viewerPort}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Screencast failed for "${id}", running headless: ${msg}`);
        return { content: [{ type: 'text', text: `Session "${id}" created (visible mode failed, running headless: ${msg}). URL: ${rewritten}, Port: ${session.port}` }] };
      }
    }

    return { content: [{ type: 'text', text: `Session "${id}" created. URL: ${rewritten}, Port: ${session.port}` }] };
  });

  // session_destroy
  handlers.set('session_destroy', async (args): Promise<ToolResult> => {
    const { session_id: id } = args as { session_id: string };
    ctx.healthMonitor.unregister(id);
    const viewerProc = ctx.viewerProcesses.get(id);
    if (viewerProc) {
      viewerProc.kill();
      ctx.viewerProcesses.delete(id);
    }
    await ctx.screencastRelay.stop(id);
    await ctx.browserBridge.disconnect(id);
    await ctx.sessionManager.destroy(id);
    return { content: [{ type: 'text', text: `Session "${id}" destroyed.` }] };
  });

  // session_list
  handlers.set('session_list', async (_args): Promise<ToolResult> => {
    const sessions = ctx.sessionManager.list();
    if (sessions.length === 0) {
      return { content: [{ type: 'text', text: 'No active sessions.' }] };
    }
    const lines = sessions.map((s) => {
      const viewer = s.viewerPort ? `, viewer ws://localhost:${s.viewerPort}` : '';
      const actions = ctx.actionTracker.getCount(s.id);
      return `- ${s.id}: ${s.url} (${s.status}, port ${s.port}, ${actions} actions${viewer})`;
    });
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  // session_summary
  handlers.set('session_summary', async (args): Promise<ToolResult> => {
    const { session_id: id } = args as { session_id: string };
    const session = ctx.sessionManager.get(id);
    if (!session) {
      return { content: [{ type: 'text', text: `Session "${id}" not found.` }], isError: true };
    }
    let currentUrl: string;
    try {
      currentUrl = await ctx.browserBridge.getCurrentUrl(id);
    } catch {
      currentUrl = session.url;
    }
    const viewer = session.viewerPort ? `, viewer ws://localhost:${session.viewerPort}` : '';
    const summaryText = ctx.actionTracker.getSummaryText(id, currentUrl);
    const text = `${id}: ${summaryText}, mode: ${session.mode}, port: ${session.port}${viewer}`;
    return { content: [{ type: 'text', text }] };
  });

  // profile_save
  handlers.set('profile_save', async (args): Promise<ToolResult> => {
    const { name: profileName, url, auth_name, viewport } = args as {
      name: string; url: string; auth_name?: string; viewport?: { width: number; height: number };
    };
    ctx.database.saveProfile({
      name: profileName,
      url,
      authName: auth_name,
      viewportJson: viewport ? JSON.stringify(viewport) : undefined,
    });
    return { content: [{ type: 'text', text: `Profile "${profileName}" saved.` }] };
  });

  // profile_list
  handlers.set('profile_list', async (_args): Promise<ToolResult> => {
    const profiles = ctx.database.listProfiles();
    if (profiles.length === 0) {
      return { content: [{ type: 'text', text: 'No saved profiles.' }] };
    }
    const lines = profiles.map((p) => {
      const auth = p.authName ? `, auth: ${p.authName}` : '';
      return `- ${p.name}: ${p.url}${auth}`;
    });
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  // profile_delete
  handlers.set('profile_delete', async (args): Promise<ToolResult> => {
    const { name: profileName } = args as { name: string };
    ctx.database.deleteProfile(profileName);
    return { content: [{ type: 'text', text: `Profile "${profileName}" deleted.` }] };
  });

  return handlers;
}
