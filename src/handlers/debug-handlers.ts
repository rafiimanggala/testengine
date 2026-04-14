import type { HandlerContext, ToolHandler } from './types.js';

export function createDebugHandlers(ctx: HandlerContext): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set('console_log', async (args) => {
    const { session_id, clear } = args as { session_id: string; clear?: boolean };
    const collector = ctx.browserBridge.getConsoleCollector();
    const entries = collector.get(session_id);
    if (clear) collector.clear(session_id);

    ctx.actionTracker.record(session_id, 'console_log', { clear }, `${entries.length} messages`);
    ctx.healthMonitor.touchAction(session_id);

    if (entries.length === 0) {
      return { content: [{ type: 'text', text: 'No console messages.' }] };
    }

    const lines = entries.map((e) => `[${e.level}] ${e.text}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  handlers.set('get_network_log', async (args) => {
    const { session_id, filter } = args as { session_id: string; filter?: string };
    const collector = ctx.browserBridge.getNetworkCollector();
    const entries = collector.get(session_id, filter);

    ctx.actionTracker.record(session_id, 'get_network_log', { filter }, `${entries.length} entries`);
    ctx.healthMonitor.touchAction(session_id);

    if (entries.length === 0) {
      return { content: [{ type: 'text', text: filter ? `No network entries matching "${filter}".` : 'No network entries.' }] };
    }

    const lines = entries.map((e) =>
      `${e.method} ${e.url} → ${e.status} (${e.duration}ms, ${e.resourceType})`
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });

  handlers.set('wait_for_request', async (args) => {
    const { session_id, url_pattern, timeout } = args as { session_id: string; url_pattern: string; timeout?: number };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.waitForNetworkRequest(session_id, url_pattern, timeout)
    );
    const text = `Matched: ${result.method} ${result.url} → ${result.status ?? 'pending'}`;
    ctx.actionTracker.record(session_id, 'wait_for_request', { url_pattern, timeout }, text);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text }] };
  });

  return handlers;
}
