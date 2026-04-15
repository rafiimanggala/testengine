export const sessionToolDefs = [
  {
    name: 'session_create',
    description: 'Create a new isolated browser session in a Docker container. Returns session info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Unique session identifier (e.g. "biobrain", "surfecho")' },
        url: { type: 'string', description: 'URL to navigate to after creation' },
        mode: { type: 'string', enum: ['headless', 'visible'], description: 'Display mode (default: headless)' },
      },
      required: ['session_id', 'url'],
    },
  },
  {
    name: 'session_destroy',
    description: 'Destroy a browser session and its Docker container.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID to destroy' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'session_list',
    description: 'List all active browser sessions with their status and URLs.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'session_summary',
    description: 'Get an AI-friendly summary of a session: current URL, action count, last action. Useful after context compaction to recover session state.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'profile_save',
    description: 'Save a project profile (URL + auth + viewport config) for quick session setup.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Profile name (e.g. "biobrain-admin")' },
        url: { type: 'string', description: 'Default URL for this profile' },
        auth_name: { type: 'string', description: 'Name of saved auth to auto-load (optional)' },
        viewport: { type: 'object', description: 'Viewport config { width, height } (optional)', properties: { width: { type: 'number' }, height: { type: 'number' } } },
      },
      required: ['name', 'url'],
    },
  },
  {
    name: 'profile_list',
    description: 'List all saved project profiles.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'profile_delete',
    description: 'Delete a saved project profile.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Profile name to delete' },
      },
      required: ['name'],
    },
  },
];
