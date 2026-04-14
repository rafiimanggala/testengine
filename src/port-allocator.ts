export class PortAllocator {
  private basePort: number;
  private allocated: Map<string, number> = new Map();
  private released: number[] = [];

  constructor(basePort: number = 3001) {
    this.basePort = basePort;
  }

  allocate(sessionId: string): number {
    if (this.allocated.has(sessionId)) {
      throw new Error(`Port already allocated for session: ${sessionId}`);
    }
    const port =
      this.released.length > 0
        ? this.released.shift()!
        : this.basePort + this.allocated.size;
    this.allocated.set(sessionId, port);
    return port;
  }

  release(sessionId: string): void {
    const port = this.allocated.get(sessionId);
    if (port !== undefined) {
      this.allocated.delete(sessionId);
      this.released.push(port);
      this.released.sort((a, b) => a - b);
    }
  }

  getPort(sessionId: string): number | undefined {
    return this.allocated.get(sessionId);
  }

  listAllocated(): Array<{ sessionId: string; port: number }> {
    return Array.from(this.allocated.entries()).map(([sessionId, port]) => ({
      sessionId,
      port,
    }));
  }
}
