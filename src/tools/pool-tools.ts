export const poolToolDefs = [
  {
    name: 'pool_set',
    description: 'Set the container pool size. Pre-warms N containers for instant session_create (<1s). Set to 0 to disable pooling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        size: { type: 'number', description: 'Number of warm containers to maintain (0-5)' },
      },
      required: ['size'],
    },
  },
  {
    name: 'pool_status',
    description: 'Show container pool status: warm containers, active sessions, target pool size.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'session_health',
    description: 'Check health of a session container: running state, memory usage (MB), uptime (minutes).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID to check' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'session_recycle',
    description: 'Recycle a session container: saves auth state, destroys old container, creates new one with same config. Preserves cookies/localStorage.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID to recycle' },
      },
      required: ['session_id'],
    },
  },
];
