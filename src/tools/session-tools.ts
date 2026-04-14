export const sessionToolDefs = [
  {
    name: 'session_create',
    description: 'Create a new isolated browser session in a Docker container. Returns session info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Unique session identifier (e.g. "biobrain", "surfecho")' },
        url: { type: 'string', description: 'URL to navigate to after creation' },
        mode: { type: 'string', enum: ['headless', 'visible'], description: 'Display mode (default: headless)' },
      },
      required: ['id', 'url'],
    },
  },
  {
    name: 'session_destroy',
    description: 'Destroy a browser session and its Docker container.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Session ID to destroy' },
      },
      required: ['id'],
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
];
