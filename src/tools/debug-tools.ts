export const debugToolDefs = [
  {
    name: 'console_log',
    description: 'Get accumulated JS console messages (log/warn/error/info) from the page. Useful for debugging client-side errors.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        clear: { type: 'boolean', description: 'Clear the console buffer after reading (default: false)' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'get_network_log',
    description: 'Get recent HTTP request/response pairs. Ring buffer keeps last 100 entries. Useful for debugging API calls and failed requests.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        filter: { type: 'string', description: 'URL substring filter (e.g. "/api/", "graphql")' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'wait_for_request',
    description: 'Wait for a network request matching a URL pattern. Returns request details when matched. Useful for waiting on API calls after user actions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        url_pattern: { type: 'string', description: 'URL substring to match (e.g. "/api/login", "checkout")' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
      },
      required: ['session_id', 'url_pattern'],
    },
  },
];
