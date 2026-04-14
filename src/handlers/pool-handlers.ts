// src/handlers/pool-handlers.ts
import type { HandlerContext, ToolHandler, ToolResult } from './types.js';

export function createPoolHandlers(ctx: HandlerContext): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // pool_set
  handlers.set('pool_set', async (args): Promise<ToolResult> => {
    const { size } = args as { size: number };
    if (size < 0 || size > 5) {
      return { content: [{ type: 'text', text: 'Pool size must be 0-5' }], isError: true };
    }
    const pool = ctx.sessionManager.getPool();
    pool.setSize(size);
    await pool.fill();
    const status = pool.status();
    return { content: [{ type: 'text', text: `Pool target set to ${size}. Warm: ${status.warm}, Active: ${status.active}` }] };
  });

  // pool_status
  handlers.set('pool_status', async (_args): Promise<ToolResult> => {
    const pool = ctx.sessionManager.getPool();
    const status = pool.status();
    const active = pool.listActive();
    const lines = [
      `Pool: ${status.warm} warm, ${status.active} active, target ${status.targetSize}`,
      ...active.map((a) => `  ${a.sessionId}: port ${a.port}, up ${Math.round((Date.now() - a.startedAt.getTime()) / 60000)}min`),
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  // session_health
  handlers.set('session_health', async (args): Promise<ToolResult> => {
    const { session_id } = args as { session_id: string };
    const container = ctx.sessionManager.getPool().getContainer(session_id);
    if (!container) {
      return { content: [{ type: 'text', text: `No container for session "${session_id}"` }], isError: true };
    }
    const health = await ctx.healthMonitor.check(container);
    return {
      content: [{
        type: 'text',
        text: `${session_id}: ${health.running ? 'running' : 'STOPPED'}, memory ${health.memoryMB}MB, uptime ${health.uptimeMinutes}min`,
      }],
    };
  });

  // session_recycle
  handlers.set('session_recycle', async (args): Promise<ToolResult> => {
    const { session_id } = args as { session_id: string };
    const session = ctx.sessionManager.get(session_id);
    if (!session) {
      return { content: [{ type: 'text', text: `Session "${session_id}" not found` }], isError: true };
    }

    // Capture current URL before destroying
    let currentUrl = session.url;
    try {
      currentUrl = await ctx.browserBridge.getCurrentUrl(session_id);
    } catch { /* use original */ }

    // Save current auth state
    let savedAuth: string | null = null;
    try {
      savedAuth = await ctx.browserBridge.saveAuthToJson(session_id);
    } catch { /* no page to save from */ }

    // Destroy old
    ctx.healthMonitor.unregister(session_id);
    const viewerProc = ctx.viewerProcesses.get(session_id);
    if (viewerProc) { viewerProc.kill(); ctx.viewerProcesses.delete(session_id); }
    await ctx.screencastRelay.stop(session_id);
    await ctx.browserBridge.disconnect(session_id);
    const oldMode = session.mode;
    await ctx.sessionManager.destroy(session_id);

    // Recreate
    const newSession = await ctx.sessionManager.create(session_id, currentUrl, oldMode);
    await ctx.browserBridge.connect(session_id);

    const newContainer = ctx.sessionManager.getPool().getContainer(session_id);
    if (newContainer) ctx.healthMonitor.register(session_id, newContainer);

    // Restore auth if saved
    if (savedAuth) {
      await ctx.browserBridge.loadAuthFromJson(session_id, savedAuth);
    }

    await ctx.browserBridge.navigate(session_id, currentUrl);

    return {
      content: [{
        type: 'text',
        text: `Recycled "${session_id}". Port: ${newSession.port}, auth ${savedAuth ? 'restored' : 'none'}`,
      }],
    };
  });

  return handlers;
}
