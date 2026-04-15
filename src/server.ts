import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ChildProcess } from 'child_process';
import { SessionManager } from './session-manager.js';
import { BrowserBridge } from './browser-bridge.js';
import { Database } from './database.js';
import { ActionTracker } from './action-tracker.js';
import { ScreencastRelay } from './screencast-relay.js';
import { CommandQueue } from './command-queue.js';
import { HealthMonitor } from './health-monitor.js';
import { sessionToolDefs } from './tools/session-tools.js';
import { browserToolDefs } from './tools/browser-tools.js';
import { authToolDefs } from './tools/auth-tools.js';
import { poolToolDefs } from './tools/pool-tools.js';
import { debugToolDefs } from './tools/debug-tools.js';
import { tabToolDefs } from './tools/tab-tools.js';
import { createSessionHandlers } from './handlers/session-handlers.js';
import { createBrowserHandlers } from './handlers/browser-handlers.js';
import { createAuthHandlers } from './handlers/auth-handlers.js';
import { createPoolHandlers } from './handlers/pool-handlers.js';
import { createDebugHandlers } from './handlers/debug-handlers.js';
import { createTabHandlers } from './handlers/tab-handlers.js';
import type { ToolHandler } from './handlers/types.js';

const SESSION_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWER_BINARY = join(__dirname, '..', 'viewer', 'TestEngineViewer', '.build', 'release', 'TestEngineViewer');

const database = new Database();
const actionTracker = new ActionTracker(database);
const sessionManager = new SessionManager(undefined, undefined, database);
const browserBridge = new BrowserBridge(sessionManager);
const screencastRelay = new ScreencastRelay(9200);
const viewerProcesses = new Map<string, ChildProcess>();

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
    healthMonitor.unregister(sessionId);
  },
});
healthMonitor.start();

const ctx = { sessionManager, browserBridge, commandQueue, healthMonitor, actionTracker, database, screencastRelay, viewerProcesses, viewerBinary: VIEWER_BINARY, sessionIdRegex: SESSION_ID_RE };
const registry = new Map<string, ToolHandler>();
for (const factory of [createSessionHandlers, createBrowserHandlers, createAuthHandlers, createPoolHandlers, createDebugHandlers, createTabHandlers]) {
  for (const [name, handler] of factory(ctx)) registry.set(name, handler);
}

const server = new Server(
  { name: 'testengine', version: '0.2.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...sessionToolDefs, ...browserToolDefs, ...authToolDefs, ...poolToolDefs, ...debugToolDefs, ...tabToolDefs],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = registry.get(name);
  if (!handler) {
    return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    return await handler(args as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
  }
});

let cleaningUp = false;
const cleanup = async () => {
  if (cleaningUp) return;
  cleaningUp = true;
  try {
    healthMonitor.stop();
    for (const proc of viewerProcesses.values()) proc.kill();
    viewerProcesses.clear();
    await screencastRelay.stopAll();
    await sessionManager.destroyAll();
    await sessionManager.getPool().drain();
    database.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
