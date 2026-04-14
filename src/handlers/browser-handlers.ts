// src/handlers/browser-handlers.ts
import { rewriteUrl } from '../url-rewriter.js';
import type { HandlerContext, ToolHandler, ToolResult } from './types.js';

export function createBrowserHandlers(ctx: HandlerContext): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // navigate
  handlers.set('navigate', async (args): Promise<ToolResult> => {
    const { session_id, url } = args as { session_id: string; url: string };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.navigate(session_id, rewriteUrl(url))
    );
    ctx.actionTracker.record(session_id, 'navigate', { url }, result);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: result }] };
  });

  // click
  handlers.set('click', async (args): Promise<ToolResult> => {
    const { session_id, selector } = args as { session_id: string; selector: string };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.click(session_id, selector)
    );
    ctx.actionTracker.record(session_id, 'click', { selector }, result);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: result }] };
  });

  // type
  handlers.set('type', async (args): Promise<ToolResult> => {
    const { session_id, selector, text } = args as { session_id: string; selector: string; text: string };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.type(session_id, selector, text)
    );
    ctx.actionTracker.record(session_id, 'type', { selector, text }, result);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: result }] };
  });

  // screenshot
  handlers.set('screenshot', async (args): Promise<ToolResult> => {
    const { session_id } = args as { session_id: string };
    const buffer = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.screenshot(session_id)
    );
    ctx.actionTracker.record(session_id, 'screenshot', {}, 'screenshot taken');
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'image', data: buffer.toString('base64'), mimeType: 'image/jpeg' }] };
  });

  // get_text
  handlers.set('get_text', async (args): Promise<ToolResult> => {
    const { session_id, selector } = args as { session_id: string; selector?: string };
    const text = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.getText(session_id, selector)
    );
    ctx.actionTracker.record(session_id, 'get_text', { selector }, text);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text }] };
  });

  // wait_for
  handlers.set('wait_for', async (args): Promise<ToolResult> => {
    const { session_id, selector, timeout } = args as { session_id: string; selector: string; timeout?: number };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.waitFor(session_id, selector, timeout)
    );
    ctx.actionTracker.record(session_id, 'wait_for', { selector, timeout }, result);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: result }] };
  });

  // evaluate
  handlers.set('evaluate', async (args): Promise<ToolResult> => {
    const { session_id, script } = args as { session_id: string; script: string };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.evaluate(session_id, script)
    );
    ctx.actionTracker.record(session_id, 'evaluate', { script }, result);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: result }] };
  });

  // fill_form
  handlers.set('fill_form', async (args): Promise<ToolResult> => {
    const { session_id, fields } = args as { session_id: string; fields: Record<string, string> };
    const result = await ctx.commandQueue.enqueue(session_id, () =>
      ctx.browserBridge.fillForm(session_id, fields)
    );
    ctx.actionTracker.record(session_id, 'fill_form', { fields }, result);
    ctx.healthMonitor.touchAction(session_id);
    return { content: [{ type: 'text', text: result }] };
  });

  return handlers;
}
