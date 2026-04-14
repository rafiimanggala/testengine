import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { join } from 'path';
import { SessionManager } from './session-manager.js';
import { BrowserBridge } from './browser-bridge.js';
import { Database } from './database.js';
import { ActionTracker } from './action-tracker.js';
import { ScreencastRelay } from './screencast-relay.js';
import { rewriteUrl } from './url-rewriter.js';
import { sessionToolDefs } from './tools/session-tools.js';
import { browserToolDefs } from './tools/browser-tools.js';
import { authToolDefs } from './tools/auth-tools.js';
import { execFile, ChildProcess } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { CommandQueue } from './command-queue.js';
import { HealthMonitor } from './health-monitor.js';
import { poolToolDefs } from './tools/pool-tools.js';

const SESSION_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;

const database = new Database();
const actionTracker = new ActionTracker(database);
const sessionManager = new SessionManager(undefined, undefined, database);
const browserBridge = new BrowserBridge(sessionManager);
const screencastRelay = new ScreencastRelay(9200);
const viewerProcesses = new Map<string, ChildProcess>();
const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWER_BINARY = join(__dirname, '..', 'viewer', 'TestEngineViewer', '.build', 'release', 'TestEngineViewer');

const commandQueue = new CommandQueue();
const healthMonitor = new HealthMonitor({
  onRecycle: async (sessionId, reason) => {
    console.error(`[health] recycling ${sessionId}: ${reason}`);
    try {
      const authJson = await browserBridge.saveAuthToJson(sessionId);
      const parsed = JSON.parse(authJson);
      database.saveAuth(`__recycle_${sessionId}`, JSON.stringify(parsed.cookies), JSON.stringify(parsed.origins));
    } catch { /* no auth to save */ }
    await browserBridge.disconnect(sessionId);
    await sessionManager.destroy(sessionId);
    healthMonitor.unregister(sessionId);
  },
  onHibernate: async (sessionId) => {
    console.error(`[health] hibernating ${sessionId}: idle >30min`);
    try {
      const authJson = await browserBridge.saveAuthToJson(sessionId);
      const parsed = JSON.parse(authJson);
      database.saveAuth(`__hibernate_${sessionId}`, JSON.stringify(parsed.cookies), JSON.stringify(parsed.origins));
    } catch { /* no auth to save */ }
    const container = sessionManager.getPool().getContainer(sessionId);
    if (container) {
      try { await container.stop(); } catch { /* already stopped */ }
    }
    sessionManager.setStatus(sessionId, 'stopped');
  },
});
healthMonitor.start();

const server = new Server(
  { name: 'testengine', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// List all tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...sessionToolDefs, ...browserToolDefs, ...authToolDefs, ...poolToolDefs],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // === Session Tools ===
      case 'session_create': {
        const { id, url, mode } = args as { id: string; url: string; mode?: string };
        if (!SESSION_ID_RE.test(id)) {
          return { content: [{ type: 'text', text: `Invalid session ID "${id}". Must match [a-zA-Z0-9][a-zA-Z0-9_-]{0,62}.` }], isError: true };
        }
        const sessionMode = (mode as 'headless' | 'visible') ?? 'headless';
        const session = await sessionManager.create(id, url, sessionMode);
        await browserBridge.connect(id);
        const container = sessionManager.getPool().getContainer(id);
        if (container) healthMonitor.register(id, container);
        const rewritten = rewriteUrl(url);
        await browserBridge.navigate(id, rewritten);

        if (sessionMode === 'visible') {
          try {
            const page = browserBridge.getPage(id);
            const viewerPort = await screencastRelay.start(id, page);
            session.viewerPort = viewerPort;
            const child = execFile(VIEWER_BINARY, ['--session', id, '--ws', `ws://localhost:${viewerPort}`], (err) => {
              if (err) console.error(`Viewer launch failed for "${id}": ${err.message}`);
            });
            viewerProcesses.set(id, child);
            return { content: [{ type: 'text', text: `Session "${id}" created (visible). URL: ${rewritten}, Port: ${session.port}, Viewer: ws://localhost:${viewerPort}` }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Screencast failed for "${id}", running headless: ${msg}`);
            return { content: [{ type: 'text', text: `Session "${id}" created (visible mode failed, running headless: ${msg}). URL: ${rewritten}, Port: ${session.port}` }] };
          }
        }

        return { content: [{ type: 'text', text: `Session "${id}" created. URL: ${rewritten}, Port: ${session.port}` }] };
      }

      case 'session_destroy': {
        const { id } = args as { id: string };
        healthMonitor.unregister(id);
        const viewerProc = viewerProcesses.get(id);
        if (viewerProc) {
          viewerProc.kill();
          viewerProcesses.delete(id);
        }
        await screencastRelay.stop(id);
        await browserBridge.disconnect(id);
        await sessionManager.destroy(id);
        return { content: [{ type: 'text', text: `Session "${id}" destroyed.` }] };
      }

      case 'session_list': {
        const sessions = sessionManager.list();
        if (sessions.length === 0) {
          return { content: [{ type: 'text', text: 'No active sessions.' }] };
        }
        const lines = sessions.map((s) => {
          const viewer = s.viewerPort ? `, viewer ws://localhost:${s.viewerPort}` : '';
          const actions = actionTracker.getCount(s.id);
          return `- ${s.id}: ${s.url} (${s.status}, port ${s.port}, ${actions} actions${viewer})`;
        });
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      case 'session_summary': {
        const { id } = args as { id: string };
        const session = sessionManager.get(id);
        if (!session) {
          return { content: [{ type: 'text', text: `Session "${id}" not found.` }], isError: true };
        }
        let currentUrl: string;
        try {
          currentUrl = await browserBridge.getCurrentUrl(id);
        } catch {
          currentUrl = session.url;
        }
        const viewer = session.viewerPort ? `, viewer ws://localhost:${session.viewerPort}` : '';
        const summaryText = actionTracker.getSummaryText(id, currentUrl);
        const text = `${id}: ${summaryText}, mode: ${session.mode}, port: ${session.port}${viewer}`;
        return { content: [{ type: 'text', text }] };
      }

      // === Browser Tools ===
      case 'navigate': {
        const { session_id, url } = args as { session_id: string; url: string };
        const result = await commandQueue.enqueue(session_id, () =>
          browserBridge.navigate(session_id, rewriteUrl(url))
        );
        actionTracker.record(session_id, 'navigate', { url }, result);
        healthMonitor.touchAction(session_id);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'click': {
        const { session_id, selector } = args as { session_id: string; selector: string };
        const result = await commandQueue.enqueue(session_id, () =>
          browserBridge.click(session_id, selector)
        );
        actionTracker.record(session_id, 'click', { selector }, result);
        healthMonitor.touchAction(session_id);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'type': {
        const { session_id, selector, text } = args as { session_id: string; selector: string; text: string };
        const result = await commandQueue.enqueue(session_id, () =>
          browserBridge.type(session_id, selector, text)
        );
        actionTracker.record(session_id, 'type', { selector, text }, result);
        healthMonitor.touchAction(session_id);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'screenshot': {
        const { session_id } = args as { session_id: string };
        const buffer = await commandQueue.enqueue(session_id, () =>
          browserBridge.screenshot(session_id)
        );
        actionTracker.record(session_id, 'screenshot', {}, 'screenshot taken');
        healthMonitor.touchAction(session_id);
        return { content: [{ type: 'image', data: buffer.toString('base64'), mimeType: 'image/jpeg' }] };
      }

      case 'get_text': {
        const { session_id, selector } = args as { session_id: string; selector?: string };
        const text = await commandQueue.enqueue(session_id, () =>
          browserBridge.getText(session_id, selector)
        );
        actionTracker.record(session_id, 'get_text', { selector }, text);
        healthMonitor.touchAction(session_id);
        return { content: [{ type: 'text', text }] };
      }

      case 'wait_for': {
        const { session_id, selector, timeout } = args as { session_id: string; selector: string; timeout?: number };
        const result = await commandQueue.enqueue(session_id, () =>
          browserBridge.waitFor(session_id, selector, timeout)
        );
        actionTracker.record(session_id, 'wait_for', { selector, timeout }, result);
        healthMonitor.touchAction(session_id);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'evaluate': {
        const { session_id, script } = args as { session_id: string; script: string };
        const result = await commandQueue.enqueue(session_id, () =>
          browserBridge.evaluate(session_id, script)
        );
        actionTracker.record(session_id, 'evaluate', { script }, result);
        healthMonitor.touchAction(session_id);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'fill_form': {
        const { session_id, fields } = args as { session_id: string; fields: Record<string, string> };
        const result = await commandQueue.enqueue(session_id, () =>
          browserBridge.fillForm(session_id, fields)
        );
        actionTracker.record(session_id, 'fill_form', { fields }, result);
        healthMonitor.touchAction(session_id);
        return { content: [{ type: 'text', text: result }] };
      }

      // === Auth Tools ===
      case 'session_auth_save': {
        const { session_id, name: authName } = args as { session_id: string; name: string };
        const stateJson = await browserBridge.saveAuthToJson(session_id);
        const parsed = JSON.parse(stateJson);
        database.saveAuth(authName, JSON.stringify(parsed.cookies), JSON.stringify(parsed.origins));
        return { content: [{ type: 'text', text: `Auth "${authName}" saved to database.` }] };
      }

      case 'session_auth_load': {
        const { session_id, name: authName } = args as { session_id: string; name: string };
        const auth = database.getAuth(authName);
        if (!auth) {
          return { content: [{ type: 'text', text: `Auth "${authName}" not found. Save it first.` }], isError: true };
        }
        const stateJson = JSON.stringify({ cookies: JSON.parse(auth.cookiesJson), origins: JSON.parse(auth.storageJson) });
        await browserBridge.loadAuthFromJson(session_id, stateJson);
        return { content: [{ type: 'text', text: `Auth "${authName}" loaded from database.` }] };
      }

      // === Profile Tools ===
      case 'profile_save': {
        const { name: profileName, url, auth_name, viewport } = args as {
          name: string; url: string; auth_name?: string; viewport?: { width: number; height: number };
        };
        database.saveProfile({
          name: profileName,
          url,
          authName: auth_name,
          viewportJson: viewport ? JSON.stringify(viewport) : undefined,
        });
        return { content: [{ type: 'text', text: `Profile "${profileName}" saved.` }] };
      }

      case 'profile_list': {
        const profiles = database.listProfiles();
        if (profiles.length === 0) {
          return { content: [{ type: 'text', text: 'No saved profiles.' }] };
        }
        const lines = profiles.map((p) => {
          const auth = p.authName ? `, auth: ${p.authName}` : '';
          return `- ${p.name}: ${p.url}${auth}`;
        });
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      case 'profile_delete': {
        const { name: profileName } = args as { name: string };
        database.deleteProfile(profileName);
        return { content: [{ type: 'text', text: `Profile "${profileName}" deleted.` }] };
      }

      // === Pool & Resilience Tools ===
      case 'pool_set': {
        const { size } = args as { size: number };
        if (size < 0 || size > 5) {
          return { content: [{ type: 'text', text: 'Pool size must be 0-5' }], isError: true };
        }
        const pool = sessionManager.getPool();
        pool.setSize(size);
        await pool.fill();
        const status = pool.status();
        return { content: [{ type: 'text', text: `Pool target set to ${size}. Warm: ${status.warm}, Active: ${status.active}` }] };
      }

      case 'pool_status': {
        const pool = sessionManager.getPool();
        const status = pool.status();
        const active = pool.listActive();
        const lines = [
          `Pool: ${status.warm} warm, ${status.active} active, target ${status.targetSize}`,
          ...active.map((a) => `  ${a.sessionId}: port ${a.port}, up ${Math.round((Date.now() - a.startedAt.getTime()) / 60000)}min`),
        ];
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      case 'session_health': {
        const { session_id } = args as { session_id: string };
        const container = sessionManager.getPool().getContainer(session_id);
        if (!container) {
          return { content: [{ type: 'text', text: `No container for session "${session_id}"` }], isError: true };
        }
        const health = await healthMonitor.check(container);
        return {
          content: [{
            type: 'text',
            text: `${session_id}: ${health.running ? 'running' : 'STOPPED'}, memory ${health.memoryMB}MB, uptime ${health.uptimeMinutes}min`,
          }],
        };
      }

      case 'session_recycle': {
        const { session_id } = args as { session_id: string };
        const session = sessionManager.get(session_id);
        if (!session) {
          return { content: [{ type: 'text', text: `Session "${session_id}" not found` }], isError: true };
        }

        // Capture current URL before destroying
        let currentUrl = session.url;
        try {
          currentUrl = await browserBridge.getCurrentUrl(session_id);
        } catch { /* use original */ }

        // Save current auth state
        let savedAuth: string | null = null;
        try {
          savedAuth = await browserBridge.saveAuthToJson(session_id);
        } catch { /* no page to save from */ }

        // Destroy old
        healthMonitor.unregister(session_id);
        const viewerProc = viewerProcesses.get(session_id);
        if (viewerProc) { viewerProc.kill(); viewerProcesses.delete(session_id); }
        await screencastRelay.stop(session_id);
        await browserBridge.disconnect(session_id);
        const oldMode = session.mode;
        await sessionManager.destroy(session_id);

        // Recreate
        const newSession = await sessionManager.create(session_id, currentUrl, oldMode);
        await browserBridge.connect(session_id);

        const newContainer = sessionManager.getPool().getContainer(session_id);
        if (newContainer) healthMonitor.register(session_id, newContainer);

        // Restore auth if saved
        if (savedAuth) {
          await browserBridge.loadAuthFromJson(session_id, savedAuth);
        }

        await browserBridge.navigate(session_id, currentUrl);

        return {
          content: [{
            type: 'text',
            text: `Recycled "${session_id}". Port: ${newSession.port}, auth ${savedAuth ? 'restored' : 'none'}`,
          }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

// Cleanup on exit
process.on('SIGINT', async () => {
  healthMonitor.stop();
  for (const proc of viewerProcesses.values()) proc.kill();
  viewerProcesses.clear();
  await screencastRelay.stopAll();
  await sessionManager.destroyAll();
  await sessionManager.getPool().drain();
  database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  healthMonitor.stop();
  for (const proc of viewerProcesses.values()) proc.kill();
  viewerProcesses.clear();
  await screencastRelay.stopAll();
  await sessionManager.destroyAll();
  await sessionManager.getPool().drain();
  database.close();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
