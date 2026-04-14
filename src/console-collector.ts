export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  text: string;
  timestamp: number;
}

export class ConsoleCollector {
  private buffers: Map<string, ConsoleEntry[]> = new Map();
  private maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  push(sessionId: string, entry: ConsoleEntry): void {
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(sessionId, buffer);
    }
    buffer.push(entry);
    if (buffer.length > this.maxEntries) {
      buffer.shift();
    }
  }

  get(sessionId: string): ConsoleEntry[] {
    return [...(this.buffers.get(sessionId) ?? [])];
  }

  clear(sessionId: string): void {
    this.buffers.delete(sessionId);
  }
}
