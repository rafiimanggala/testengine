import { describe, it, expect } from 'vitest';
import { PortAllocator } from '../src/port-allocator.js';

describe('PortAllocator', () => {
  it('allocates ports starting from base', () => {
    const alloc = new PortAllocator(3001);
    expect(alloc.allocate('session-a')).toBe(3001);
    expect(alloc.allocate('session-b')).toBe(3002);
  });

  it('rejects duplicate session ids', () => {
    const alloc = new PortAllocator(3001);
    alloc.allocate('session-a');
    expect(() => alloc.allocate('session-a')).toThrow('already allocated');
  });

  it('releases ports for reuse', () => {
    const alloc = new PortAllocator(3001);
    alloc.allocate('session-a');
    alloc.release('session-a');
    expect(alloc.allocate('session-b')).toBe(3001);
  });

  it('lists allocated ports', () => {
    const alloc = new PortAllocator(3001);
    alloc.allocate('a');
    alloc.allocate('b');
    expect(alloc.listAllocated()).toEqual([
      { sessionId: 'a', port: 3001 },
      { sessionId: 'b', port: 3002 },
    ]);
  });
});
