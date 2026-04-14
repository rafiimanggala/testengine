import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { SessionManager } from './session-manager.js';
import { BrowserBridge } from './browser-bridge.js';
import { rewriteUrl } from './url-rewriter.js';
import { sessionToolDefs } from './tools/session-tools.js';
import { browserToolDefs } from './tools/browser-tools.js';
import { authToolDefs } from './tools/auth-tools.js';

const AUTH_DIR = join(process.cwd(), 'data', 'auth');
if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

const sessionManager = new SessionManager();
const browserBridge = new BrowserBridge(sessionManager);

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
        const session = await sessionManager.create(id, url, (mode as 'headless' | 'visible') ?? 'headless');
        await browserBridge.connect(id);
        const rewritten = rewriteUrl(url);
        await browserBridge.navigate(id, rewritten);
        return { content: [{ type: 'text', text: `Session "${id}" created. URL: ${rewritten}, Port: ${session.port}` }] };
      }

      case 'session_destroy': {
        const { id } = args as { id: string };
        await browserBridge.disconnect(id);
        await sessionManager.destroy(id);
        return { content: [{ type: 'text', text: `Session "${id}" destroyed.` }] };
      }

      case 'session_list': {
        const sessions = sessionManager.list();
        if (sessions.length === 0) {
          return { content: [{ type: 'text', text: 'No active sessions.' }] };
        }
        const lines = sessions.map((s) => `- ${s.id}: ${s.url} (${s.status}, port ${s.port})`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      // === Browser Tools ===
      case 'navigate': {
        const { session_id, url } = args as { session_id: string; url: string };
        const result = await browserBridge.navigate(session_id, rewriteUrl(url));
        return { content: [{ type: 'text', text: result }] };
      }

      case 'click': {
        const { session_id, selector } = args as { session_id: string; selector: string };
        const result = await browserBridge.click(session_id, selector);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'type': {
        const { session_id, selector, text } = args as { session_id: string; selector: string; text: string };
        const result = await browserBridge.type(session_id, selector, text);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'screenshot': {
        const { session_id } = args as { session_id: string };
        const buffer = await browserBridge.screenshot(session_id);
        return { content: [{ type: 'image', data: buffer.toString('base64'), mimeType: 'image/jpeg' }] };
      }

      case 'get_text': {
        const { session_id, selector } = args as { session_id: string; selector?: string };
        const text = await browserBridge.getText(session_id, selector);
        return { content: [{ type: 'text', text }] };
      }

      case 'wait_for': {
        const { session_id, selector, timeout } = args as { session_id: string; selector: string; timeout?: number };
        const result = await browserBridge.waitFor(session_id, selector, timeout);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'evaluate': {
        const { session_id, script } = args as { session_id: string; script: string };
        const result = await browserBridge.evaluate(session_id, script);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'fill_form': {
        const { session_id, fields } = args as { session_id: string; fields: Record<string, string> };
        const result = await browserBridge.fillForm(session_id, fields);
        return { content: [{ type: 'text', text: result }] };
      }

      // === Auth Tools ===
      case 'session_auth_save': {
        const { session_id, name: authName } = args as { session_id: string; name: string };
        const filePath = join(AUTH_DIR, `${authName}.json`);
        const result = await browserBridge.saveAuth(session_id, filePath);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'session_auth_load': {
        const { session_id, name: authName } = args as { session_id: string; name: string };
        const filePath = join(AUTH_DIR, `${authName}.json`);
        if (!existsSync(filePath)) {
          return { content: [{ type: 'text', text: `Auth "${authName}" not found. Save it first with session_auth_save.` }], isError: true };
        }
        const result = await browserBridge.loadAuth(session_id, filePath);
        return { content: [{ type: 'text', text: result }] };
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
  await sessionManager.destroyAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await sessionManager.destroyAll();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
