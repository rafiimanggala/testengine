export const authToolDefs = [
  {
    name: 'session_auth_save',
    description: 'Save the current session auth state (cookies + localStorage) to database for reuse.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        name: { type: 'string', description: 'Name for this saved auth (e.g. "biobrain-admin")' },
      },
      required: ['session_id', 'name'],
    },
  },
  {
    name: 'session_auth_load',
    description: 'Load a previously saved auth state from database into the session. Creates new browser context with saved cookies/localStorage.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        name: { type: 'string', description: 'Name of saved auth to load' },
      },
      required: ['session_id', 'name'],
    },
  },
];
