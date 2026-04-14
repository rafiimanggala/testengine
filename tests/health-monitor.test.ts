import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitor, type SessionHealth } from '../src/health-monitor.js';

const makeContainer = (running = true, memoryMB = 100, uptimeHours = 0) => ({
  inspect: vi.fn().mockResolvedValue({
    State: {
      Running: running,
      StartedAt: new Date(Date.now() - uptimeHours * 3600 * 1000).toISOString(),
    },
  }),
  stats: vi.fn().mockResolvedValue({
    memory_stats: { usage: memoryMB * 1024 * 1024 },
  }),
  restart: vi.fn(),
});

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;
  let onRecycle: ReturnType<typeof vi.fn>;
  let onHibernate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onRecycle = vi.fn();
    onHibernate = vi.fn();
    monitor = new HealthMonitor({ onRecycle, onHibernate });
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  it('checks health of a container', async () => {
    const container = makeContainer(true, 200, 0.5);
    const health = await monitor.check(container as any);
    expect(health).toEqual({
      running: true,
      memoryMB: 200,
      uptimeMinutes: expect.any(Number),
    });
    expect(health.uptimeMinutes).toBeGreaterThan(25);
  });

  it('detects crashed container', async () => {
    const container = makeContainer(false, 0, 0);
    const health = await monitor.check(container as any);
    expect(health.running).toBe(false);
  });

  it('identifies memory limit breach', () => {
    const health: SessionHealth = { running: true, memoryMB: 600, uptimeMinutes: 30 };
    expect(monitor.shouldRecycle(health)).toBe(true);
  });

  it('identifies uptime limit breach', () => {
    const health: SessionHealth = { running: true, memoryMB: 100, uptimeMinutes: 125 };
    expect(monitor.shouldRecycle(health)).toBe(true);
  });

  it('identifies idle session for hibernate', () => {
    const lastActionAt = new Date(Date.now() - 35 * 60 * 1000);
    expect(monitor.shouldHibernate(lastActionAt)).toBe(true);
  });

  it('does not hibernate active session', () => {
    const lastActionAt = new Date(Date.now() - 5 * 60 * 1000);
    expect(monitor.shouldHibernate(lastActionAt)).toBe(false);
  });

  it('healthy container passes all checks', () => {
    const health: SessionHealth = { running: true, memoryMB: 200, uptimeMinutes: 30 };
    expect(monitor.shouldRecycle(health)).toBe(false);
  });
});
