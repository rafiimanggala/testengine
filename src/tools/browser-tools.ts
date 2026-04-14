export const browserToolDefs = [
  {
    name: 'navigate',
    description: 'Navigate to a URL in the specified session.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        url: { type: 'string', description: 'URL to navigate to' },
      },
      required: ['session_id', 'url'],
    },
  },
  {
    name: 'click',
    description: 'Click an element by CSS selector. DOM-level click, not physical mouse.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        selector: { type: 'string', description: 'CSS selector of element to click' },
      },
      required: ['session_id', 'selector'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input field by CSS selector. Clears existing text first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        selector: { type: 'string', description: 'CSS selector of input element' },
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['session_id', 'selector', 'text'],
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page. Returns JPEG image.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'get_text',
    description: 'Get text content. If selector provided, gets text of that element. Otherwise gets full page body text.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        selector: { type: 'string', description: 'Optional CSS selector' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'wait_for',
    description: 'Wait for an element matching selector to appear in the DOM.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        selector: { type: 'string', description: 'CSS selector to wait for' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 10000)' },
      },
      required: ['session_id', 'selector'],
    },
  },
  {
    name: 'evaluate',
    description: 'Execute JavaScript in the page context. Returns JSON-stringified result.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        script: { type: 'string', description: 'JavaScript code to evaluate' },
      },
      required: ['session_id', 'script'],
    },
  },
  {
    name: 'fill_form',
    description: 'Fill multiple form fields at once. Keys are CSS selectors, values are text to fill.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session ID' },
        fields: { type: 'object', description: 'Object with selector:value pairs', additionalProperties: { type: 'string' } },
      },
      required: ['session_id', 'fields'],
    },
  },
];
