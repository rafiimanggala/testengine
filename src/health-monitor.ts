import type Docker from 'dockerode';

const MEMORY_LIMIT_MB = 500;
const UPTIME_LIMIT_MINUTES = 120; // 2 hours
const IDLE_LIMIT_MINUTES = 30;
const CHECK_INTERVAL_MS = 30_000;

export interface SessionHealth {
  running: boolean;
  memoryMB: number;
  uptimeMinutes: number;
}

interface HealthMonitorCallbacks {
  onRecycle: (sessionId: string, reason: string) => Promise<void>;
  onHibernate: (sessionId: string) => Promise<void>;
}

interface MonitoredSession {
  sessionId: string;
  container: Docker.Container;
  lastActionAt: Date;
}

export class HealthMonitor {
  private callbacks: HealthMonitorCallbacks;
  private sessions: Map<string, MonitoredSession> = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private recycling: Set<string> = new Set();

  constructor(callbacks: HealthMonitorCallbacks) {
    this.callbacks = callbacks;
  }

  register(sessionId: string, container: Docker.Container): void {
    this.sessions.set(sessionId, {
      sessionId,
      container,
      lastActionAt: new Date(),
    });
  }

  unregister(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  touchAction(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.lastActionAt = new Date();
  }

  async check(container: Docker.Container): Promise<SessionHealth> {
    const [info, stats] = await Promise.all([
      container.inspect(),
      container.stats({ stream: false }),
    ]);

    const running = info.State.Running;
    const memoryMB = Math.round((stats.memory_stats?.usage ?? 0) / (1024 * 1024));
    const startedAt = new Date(info.State.StartedAt);
    const uptimeMinutes = Math.round((Date.now() - startedAt.getTime()) / 60_000);

    return { running, memoryMB, uptimeMinutes };
  }

  shouldRecycle(health: SessionHealth): boolean {
    if (health.memoryMB > MEMORY_LIMIT_MB) return true;
    if (health.uptimeMinutes > UPTIME_LIMIT_MINUTES) return true;
    return false;
  }

  shouldHibernate(lastActionAt: Date): boolean {
    const idleMinutes = (Date.now() - lastActionAt.getTime()) / 60_000;
    return idleMinutes > IDLE_LIMIT_MINUTES;
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.runChecks(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async runChecks(): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (this.recycling.has(sessionId)) continue;
      try {
        const health = await this.check(session.container);

        if (!health.running) {
          this.recycling.add(sessionId);
          await this.callbacks.onRecycle(sessionId, 'container crashed').catch((err) =>
            console.error(`[health] recycle error for ${sessionId}:`, err),
          );
          this.recycling.delete(sessionId);
          continue;
        }

        if (this.shouldRecycle(health)) {
          const reason = health.memoryMB > MEMORY_LIMIT_MB
            ? `memory ${health.memoryMB}MB > ${MEMORY_LIMIT_MB}MB`
            : `uptime ${health.uptimeMinutes}min > ${UPTIME_LIMIT_MINUTES}min`;
          this.recycling.add(sessionId);
          await this.callbacks.onRecycle(sessionId, reason).catch((err) =>
            console.error(`[health] recycle error for ${sessionId}:`, err),
          );
          this.recycling.delete(sessionId);
          continue;
        }

        if (this.shouldHibernate(session.lastActionAt)) {
          this.recycling.add(sessionId);
          await this.callbacks.onHibernate(sessionId).catch((err) =>
            console.error(`[health] hibernate error for ${sessionId}:`, err),
          );
          this.recycling.delete(sessionId);
        }
      } catch {
        // Container may have been removed between check start and inspect
      }
    }
  }
}
