import { describe, it, expect, vi } from 'vitest';
import { CommandQueue } from '../src/command-queue.js';

describe('CommandQueue', () => {
  it('executes single command immediately', async () => {
    const queue = new CommandQueue();
    const result = await queue.enqueue('s1', async () => 'done');
    expect(result).toBe('done');
  });

  it('serializes concurrent commands for same session', async () => {
    const queue = new CommandQueue();
    const order: number[] = [];

    const p1 = queue.enqueue('s1', async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
      return 'first';
    });
    const p2 = queue.enqueue('s1', async () => {
      order.push(2);
      return 'second';
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('first');
    expect(r2).toBe('second');
    expect(order).toEqual([1, 2]);
  });

  it('allows parallel execution across different sessions', async () => {
    const queue = new CommandQueue();
    const order: string[] = [];

    const p1 = queue.enqueue('s1', async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push('s1');
      return 's1';
    });
    const p2 = queue.enqueue('s2', async () => {
      order.push('s2');
      return 's2';
    });

    await Promise.all([p1, p2]);
    expect(order[0]).toBe('s2');
    expect(order[1]).toBe('s1');
  });

  it('propagates errors without blocking queue', async () => {
    const queue = new CommandQueue();

    await expect(
      queue.enqueue('s1', async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');

    const result = await queue.enqueue('s1', async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('cleans up session queue after drain', async () => {
    const queue = new CommandQueue();
    await queue.enqueue('s1', async () => 'done');
    expect(queue.pending('s1')).toBe(0);
  });
});
