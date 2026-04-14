export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  resourceType: string;
  duration: number;
  timestamp: number;
}

export class NetworkCollector {
  private buffers: Map<string, NetworkEntry[]> = new Map();
  private pending: Map<string, Map<string, number>> = new Map();
  private maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  recordRequest(sessionId: string, url: string, method: string): void {
    let sessionPending = this.pending.get(sessionId);
    if (!sessionPending) {
      sessionPending = new Map();
      this.pending.set(sessionId, sessionPending);
    }
    sessionPending.set(`${method} ${url}`, Date.now());
  }

  recordResponse(sessionId: string, url: string, method: string, status: number, resourceType: string): void {
    const sessionPending = this.pending.get(sessionId);
    const key = `${method} ${url}`;
    const startTime = sessionPending?.get(key) ?? Date.now();
    sessionPending?.delete(key);

    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(sessionId, buffer);
    }
    buffer.push({
      url, method, status, resourceType,
      duration: Date.now() - startTime,
      timestamp: startTime,
    });
    if (buffer.length > this.maxEntries) {
      buffer.shift();
    }
  }

  get(sessionId: string, filter?: string): NetworkEntry[] {
    const buffer = this.buffers.get(sessionId) ?? [];
    if (!filter) return [...buffer];
    return buffer.filter((e) => e.url.includes(filter));
  }

  clear(sessionId: string): void {
    this.buffers.delete(sessionId);
    this.pending.delete(sessionId);
  }
}
