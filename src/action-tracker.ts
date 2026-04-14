import type { Database } from './database.js';

export class ActionTracker {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  record(sessionId: string, action: string, params: unknown, result: unknown): void {
    const paramsJson = params != null ? JSON.stringify(params) : null;
    const resultJson = result != null ? JSON.stringify(result) : null;
    this.db.recordAction(sessionId, action, paramsJson, resultJson);
  }

  getHistory(sessionId: string, limit?: number): ReturnType<Database['getActions']> {
    return this.db.getActions(sessionId, limit);
  }

  getCount(sessionId: string): number {
    return this.db.getActionCount(sessionId);
  }

  getLastAction(sessionId: string): ReturnType<Database['getLastAction']> {
    return this.db.getLastAction(sessionId);
  }

  getSummaryText(sessionId: string, currentUrl: string): string {
    const count = this.getCount(sessionId);
    const last = this.getLastAction(sessionId);

    let summary = `currently on ${currentUrl}, ${count} actions performed`;

    if (last) {
      const params = last.paramsJson ? JSON.parse(last.paramsJson) : {};
      const detail = params.selector ?? params.url ?? '';
      const ago = this.timeAgo(last.timestamp);
      summary += `, last action: ${last.action}${detail ? ' ' + detail : ''} (${ago})`;
    }

    return summary;
  }

  private timeAgo(isoTimestamp: string): string {
    const diff = Date.now() - new Date(isoTimestamp + 'Z').getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
}
