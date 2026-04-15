import type Docker from 'dockerode';

const IMAGE = 'testengine-browser:latest';
const SHM_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

interface WarmContainer {
  container: Docker.Container;
  port: number;
}

interface ActiveContainer {
  container: Docker.Container;
  port: number;
  sessionId: string;
  startedAt: Date;
}

export interface AcquiredContainer {
  containerId: string;
  port: number;
}

export class ContainerPool {
  private docker: Docker;
  private basePort: number;
  private nextPort: number;
  private releasedPorts: number[] = [];
  private targetSize: number = 0;
  private warm: WarmContainer[] = [];
  private active: Map<string, ActiveContainer> = new Map();
  private refillPromise: Promise<void> = Promise.resolve();

  constructor(docker: Docker, basePort: number = 9100) {
    this.docker = docker;
    this.basePort = basePort;
    this.nextPort = basePort;
  }

  setSize(size: number): void {
    this.targetSize = Math.max(0, size);
  }

  status(): { targetSize: number; warm: number; active: number } {
    return {
      targetSize: this.targetSize,
      warm: this.warm.length,
      active: this.active.size,
    };
  }

  async fill(): Promise<void> {
    const needed = this.targetSize - this.warm.length;
    for (let i = 0; i < needed; i++) {
      const port = this.allocatePort();
      const container = await this.createContainer(port);
      await container.start();
      this.warm.push({ container, port });
    }
  }

  async acquire(sessionId: string): Promise<AcquiredContainer> {
    let entry: WarmContainer;

    if (this.warm.length > 0) {
      entry = this.warm.shift()!;
    } else {
      const port = this.allocatePort();
      const container = await this.createContainer(port);
      await container.start();
      entry = { container, port };
    }

    this.active.set(sessionId, {
      container: entry.container,
      port: entry.port,
      sessionId,
      startedAt: new Date(),
    });

    this.refillPromise = this.refillPromise.then(() => this.refillBackground()).catch(() => {});

    return { containerId: entry.container.id, port: entry.port };
  }

  async release(sessionId: string): Promise<void> {
    const entry = this.active.get(sessionId);
    if (!entry) return;
    this.active.delete(sessionId);
    this.releasedPorts.push(entry.port);
    try { await entry.container.stop(); } catch { /* already stopped */ }
    try { await entry.container.remove(); } catch { /* already removed */ }
  }

  async drain(): Promise<void> {
    this.targetSize = 0;
    await this.refillPromise;

    for (const entry of this.warm) {
      this.releasedPorts.push(entry.port);
      try { await entry.container.stop(); } catch { /* ignore */ }
      try { await entry.container.remove(); } catch { /* ignore */ }
    }
    this.warm = [];

    const activeIds = Array.from(this.active.keys());
    for (const sid of activeIds) {
      await this.release(sid);
    }
  }

  getActive(sessionId: string): ActiveContainer | undefined {
    return this.active.get(sessionId);
  }

  getContainer(sessionId: string): Docker.Container | undefined {
    return this.active.get(sessionId)?.container;
  }

  listActive(): Array<{ sessionId: string; port: number; startedAt: Date }> {
    return Array.from(this.active.values()).map((a) => ({
      sessionId: a.sessionId,
      port: a.port,
      startedAt: a.startedAt,
    }));
  }

  private allocatePort(): number {
    if (this.releasedPorts.length > 0) {
      return this.releasedPorts.shift()!;
    }
    return this.nextPort++;
  }

  private async createContainer(port: number): Promise<Docker.Container> {
    return this.docker.createContainer({
      Image: IMAGE,
      name: `te-pool-${port}`,
      HostConfig: {
        ShmSize: SHM_SIZE,
        PortBindings: { '3000/tcp': [{ HostPort: String(port) }] },
        AutoRemove: false,
      },
      ExposedPorts: { '3000/tcp': {} },
      platform: 'linux/arm64',
    });
  }

  async refillBackground(): Promise<void> {
    const needed = this.targetSize - this.warm.length;
    if (needed > 0) await this.fill();
  }
}
