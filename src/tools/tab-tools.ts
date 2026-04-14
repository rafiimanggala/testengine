// src/tools/tab-tools.ts
export const tabToolDefs = [
  {
    name: 'session_tabs',
    description: 'List all open tabs/pages in the browser context. Returns index, URL, and title for each tab.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'session_tab_switch',
    description: 'Switch active page to tab at given index. Use session_tabs first to see available tabs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        index: { type: 'number', description: 'Tab index (0-based)' },
      },
      required: ['session_id', 'index'],
    },
  },
  {
    name: 'session_tab_close',
    description: 'Close tab at given index. If closing active tab, switches to nearest remaining tab. Cannot close the last tab.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        index: { type: 'number', description: 'Tab index to close (0-based)' },
      },
      required: ['session_id', 'index'],
    },
  },
];
