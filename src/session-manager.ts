import Docker from 'dockerode';
import { PortAllocator } from './port-allocator.js';
import { ContainerPool } from './container-pool.js';
import { rewriteUrl } from './url-rewriter.js';
import type { Database as TestEngineDB } from './database.js';

export interface Session {
  id: string;
  url: string;
  mode: 'headless' | 'visible';
  port: number;
  viewerPort?: number;
  containerId: string;
  status: 'starting' | 'running' | 'stopped';
  createdAt: Date;
}

export class SessionManager {
  private docker: Docker;
  private portAllocator: PortAllocator;
  private pool: ContainerPool;
  private sessions: Map<string, Session> = new Map();
  private db?: TestEngineDB;

  constructor(docker?: Docker, basePort?: number, db?: TestEngineDB, pool?: ContainerPool) {
    this.docker = docker ?? new Docker();
    this.portAllocator = new PortAllocator(basePort ?? 9100);
    this.pool = pool ?? new ContainerPool(this.docker, basePort ?? 9100);
    this.db = db;
    this.cleanupStaleFromDb();
  }

  private cleanupStaleFromDb(): void {
    if (!this.db) return;
    const staleSessions = this.db.listSessions();
    for (const s of staleSessions) {
      this.db.deleteSession(s.id);
    }
  }

  async create(id: string, url: string, mode: 'headless' | 'visible' = 'headless'): Promise<Session> {
    if (this.sessions.has(id)) {
      throw new Error(`Session "${id}" already exists`);
    }

    const rewrittenUrl = rewriteUrl(url);
    const acquired = await this.pool.acquire(id);

    const session: Session = {
      id,
      url: rewrittenUrl,
      mode,
      port: acquired.port,
      containerId: acquired.containerId,
      status: 'starting',
      createdAt: new Date(),
    };

    this.sessions.set(id, session);
    this.db?.upsertSession({
      id: session.id,
      url: session.url,
      mode: session.mode,
      status: session.status,
      port: session.port,
      containerId: session.containerId,
      viewerPort: session.viewerPort,
    });
    return session;
  }

  async destroy(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session "${id}" not found`);
    }

    await this.pool.release(id);
    this.sessions.delete(id);
    this.db?.deleteSession(id);
  }

  async destroyAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.all(ids.map((id) => this.destroy(id)));
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  getWsEndpoint(id: string): string {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session "${id}" not found`);
    return `ws://localhost:${session.port}/ws`;
  }

  setStatus(id: string, status: Session['status']): void {
    const session = this.sessions.get(id);
    if (session) {
      session.status = status;
      this.db?.updateSessionStatus(id, status);
    }
  }

  getPool(): ContainerPool {
    return this.pool;
  }
}
