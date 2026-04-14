import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerPool } from '../src/container-pool.js';

const mockContainer = {
  id: 'abc123',
  start: vi.fn(),
  stop: vi.fn(),
  remove: vi.fn(),
  inspect: vi.fn().mockResolvedValue({
    State: { Running: true, StartedAt: new Date().toISOString() },
    HostConfig: { PortBindings: { '3000/tcp': [{ HostPort: '9100' }] } },
  }),
  stats: vi.fn().mockResolvedValue({
    memory_stats: { usage: 100 * 1024 * 1024 },
  }),
};

const mockDocker = {
  createContainer: vi.fn().mockResolvedValue(mockContainer),
};

describe('ContainerPool', () => {
  let pool: ContainerPool;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = new ContainerPool(mockDocker as any, 9100);
  });

  it('starts with size 0 and no warm containers', () => {
    expect(pool.status()).toEqual({ targetSize: 0, warm: 0, active: 0 });
  });

  it('sets target pool size', () => {
    pool.setSize(2);
    expect(pool.status().targetSize).toBe(2);
  });

  it('fills pool to target size', async () => {
    pool.setSize(2);
    await pool.fill();
    expect(mockDocker.createContainer).toHaveBeenCalledTimes(2);
    expect(pool.status().warm).toBe(2);
  });

  it('acquires container from pool', async () => {
    pool.setSize(1);
    await pool.fill();
    const container = await pool.acquire('test-session');
    expect(container).toBeDefined();
    expect(container.containerId).toBe('abc123');
    expect(pool.status().warm).toBe(0);
    expect(pool.status().active).toBe(1);
  });

  it('creates container on-demand when pool is empty', async () => {
    const container = await pool.acquire('test-session');
    expect(container).toBeDefined();
    expect(mockDocker.createContainer).toHaveBeenCalledTimes(1);
    expect(pool.status().active).toBe(1);
  });

  it('releases container back (removes it)', async () => {
    const container = await pool.acquire('test-session');
    await pool.release('test-session');
    expect(mockContainer.stop).toHaveBeenCalled();
    expect(mockContainer.remove).toHaveBeenCalled();
    expect(pool.status().active).toBe(0);
  });

  it('drains all containers', async () => {
    pool.setSize(2);
    await pool.fill();
    await pool.acquire('s1');
    await pool.drain();
    expect(pool.status()).toEqual({ targetSize: 0, warm: 0, active: 0 });
  });
});
