// src/handlers/auth-handlers.ts
import type { HandlerContext, ToolHandler, ToolResult } from './types.js';

export function createAuthHandlers(ctx: HandlerContext): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // session_auth_save
  handlers.set('session_auth_save', async (args): Promise<ToolResult> => {
    const { session_id, name: authName } = args as { session_id: string; name: string };
    const stateJson = await ctx.browserBridge.saveAuthToJson(session_id);
    const parsed = JSON.parse(stateJson);
    ctx.database.saveAuth(authName, JSON.stringify(parsed.cookies), JSON.stringify(parsed.origins));
    return { content: [{ type: 'text', text: `Auth "${authName}" saved to database.` }] };
  });

  // session_auth_load
  handlers.set('session_auth_load', async (args): Promise<ToolResult> => {
    const { session_id, name: authName } = args as { session_id: string; name: string };
    const auth = ctx.database.getAuth(authName);
    if (!auth) {
      return { content: [{ type: 'text', text: `Auth "${authName}" not found. Save it first.` }], isError: true };
    }
    const stateJson = JSON.stringify({ cookies: JSON.parse(auth.cookiesJson), origins: JSON.parse(auth.storageJson) });
    await ctx.browserBridge.loadAuthFromJson(session_id, stateJson);
    return { content: [{ type: 'text', text: `Auth "${authName}" loaded from database.` }] };
  });

  return handlers;
}
