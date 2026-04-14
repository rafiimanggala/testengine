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

const SESSION_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;

const database = new Database();
const actionTracker = new ActionTracker(database);
const sessionManager = new SessionManager(undefined, undefined, database);
const browserBridge = new BrowserBridge(sessionManager);
const screencastRelay = new ScreencastRelay(9200);
const viewerProcesses = new Map<string, ChildProcess>();
const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWER_BINARY = join(__dirname, '..', 'viewer', 'TestEngineViewer', '.build', 'release', 'TestEngineViewer');

const server = new Server(
  { name: 'testengine', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// List all tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...sessionToolDefs, ...browserToolDefs, ...authToolDefs],
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
        const result = await browserBridge.navigate(session_id, rewriteUrl(url));
        actionTracker.record(session_id, 'navigate', { url }, result);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'click': {
        const { session_id, selector } = args as { session_id: string; selector: string };
        const result = await browserBridge.click(session_id, selector);
        actionTracker.record(session_id, 'click', { selector }, result);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'type': {
        const { session_id, selector, text } = args as { session_id: string; selector: string; text: string };
        const result = await browserBridge.type(session_id, selector, text);
        actionTracker.record(session_id, 'type', { selector, text }, result);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'screenshot': {
        const { session_id } = args as { session_id: string };
        const buffer = await browserBridge.screenshot(session_id);
        actionTracker.record(session_id, 'screenshot', {}, 'screenshot taken');
        return { content: [{ type: 'image', data: buffer.toString('base64'), mimeType: 'image/jpeg' }] };
      }

      case 'get_text': {
        const { session_id, selector } = args as { session_id: string; selector?: string };
        const text = await browserBridge.getText(session_id, selector);
        actionTracker.record(session_id, 'get_text', { selector }, text);
        return { content: [{ type: 'text', text }] };
      }

      case 'wait_for': {
        const { session_id, selector, timeout } = args as { session_id: string; selector: string; timeout?: number };
        const result = await browserBridge.waitFor(session_id, selector, timeout);
        actionTracker.record(session_id, 'wait_for', { selector, timeout }, result);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'evaluate': {
        const { session_id, script } = args as { session_id: string; script: string };
        const result = await browserBridge.evaluate(session_id, script);
        actionTracker.record(session_id, 'evaluate', { script }, result);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'fill_form': {
        const { session_id, fields } = args as { session_id: string; fields: Record<string, string> };
        const result = await browserBridge.fillForm(session_id, fields);
        actionTracker.record(session_id, 'fill_form', { fields }, result);
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
  for (const proc of viewerProcesses.values()) proc.kill();
  viewerProcesses.clear();
  await screencastRelay.stopAll();
  await sessionManager.destroyAll();
  database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  for (const proc of viewerProcesses.values()) proc.kill();
  viewerProcesses.clear();
  await screencastRelay.stopAll();
  await sessionManager.destroyAll();
  database.close();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
