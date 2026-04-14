// src/handlers/tab-handlers.ts
import type { HandlerContext, ToolHandler } from './types.js';

export function createTabHandlers(ctx: HandlerContext): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set('session_tabs', async (args) => {
    const { session_id } = args as { session_id: string };
    const tabs = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.getPages(session_id)
    );
    if (tabs.length === 0) {
      return { content: [{ type: 'text', text: 'No open tabs.' }] };
    }
    const lines = tabs.map((t) => `[${t.index}] ${t.url} — ${t.title}`);
    ctx.actionTracker.record(session_id, 'session_tabs', {}, `${tabs.length} tabs`);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  handlers.set('session_tab_switch', async (args) => {
    const { session_id, index } = args as { session_id: string; index: number };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.switchTab(session_id, index)
    );
    ctx.actionTracker.record(session_id, 'session_tab_switch', { index }, result);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: result }] };
  });

  handlers.set('session_tab_close', async (args) => {
    const { session_id, index } = args as { session_id: string; index: number };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.closeTab(session_id, index)
    );
    ctx.actionTracker.record(session_id, 'session_tab_close', { index }, result);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: result }] };
  });

  return handlers;
}
