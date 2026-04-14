export class CommandQueue {
  private queues: Map<string, Promise<unknown>> = new Map();
  private counts: Map<string, number> = new Map();

  async enqueue<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(sessionId) ?? Promise.resolve();
    this.counts.set(sessionId, (this.counts.get(sessionId) ?? 0) + 1);

    const next = prev.then(fn, () => fn());

    const tracked = next.then(
      (result) => { this.decrement(sessionId); return result; },
      (err) => { this.decrement(sessionId); throw err; },
    );

    this.queues.set(sessionId, next.catch(() => {}));

    return tracked;
  }

  pending(sessionId: string): number {
    return this.counts.get(sessionId) ?? 0;
  }

  private decrement(sessionId: string): void {
    const count = (this.counts.get(sessionId) ?? 1) - 1;
    if (count <= 0) {
      this.counts.delete(sessionId);
      this.queues.delete(sessionId);
    } else {
      this.counts.set(sessionId, count);
    }
  }
}
