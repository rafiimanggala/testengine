import Docker from 'dockerode';
import { PortAllocator } from './port-allocator.js';
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

const DOCKER_IMAGE = 'testengine-browser';
const CONTAINER_PREFIX = 'te-';

export class SessionManager {
  private docker: Docker;
  private portAllocator: PortAllocator;
  private sessions: Map<string, Session> = new Map();
  private db?: TestEngineDB;

  constructor(docker?: Docker, basePort?: number, db?: TestEngineDB) {
    this.docker = docker ?? new Docker();
    this.portAllocator = new PortAllocator(basePort ?? 9100);
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

    const port = this.portAllocator.allocate(id);
    const rewrittenUrl = rewriteUrl(url);

    const container = await this.docker.createContainer({
      Image: DOCKER_IMAGE,
      name: `${CONTAINER_PREFIX}${id}`,
      ExposedPorts: { '3000/tcp': {} },
      HostConfig: {
        PortBindings: { '3000/tcp': [{ HostPort: String(port) }] },
        ShmSize: 2 * 1024 * 1024 * 1024, // 2GB
      },
    });

    await container.start();

    const session: Session = {
      id,
      url: rewrittenUrl,
      mode,
      port,
      containerId: container.id,
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

    const container = this.docker.getContainer(session.containerId);
    try {
      await container.stop({ t: 5 });
    } catch {
      // Container may already be stopped
    }
    try {
      await container.remove({ force: true });
    } catch {
      // Container may already be removed
    }

    this.portAllocator.release(id);
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
}
