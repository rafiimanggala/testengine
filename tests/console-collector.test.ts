import { describe, it, expect } from 'vitest';
import { ConsoleCollector } from '../src/console-collector.js';

describe('ConsoleCollector', () => {
  it('starts with empty buffer', () => {
    const collector = new ConsoleCollector();
    expect(collector.get('s1')).toEqual([]);
  });

  it('collects console entries', () => {
    const collector = new ConsoleCollector();
    collector.push('s1', { level: 'log', text: 'hello', timestamp: 1000 });
    collector.push('s1', { level: 'error', text: 'fail', timestamp: 2000 });
    const entries = collector.get('s1');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ level: 'log', text: 'hello', timestamp: 1000 });
    expect(entries[1]).toEqual({ level: 'error', text: 'fail', timestamp: 2000 });
  });

  it('isolates sessions', () => {
    const collector = new ConsoleCollector();
    collector.push('s1', { level: 'log', text: 'a', timestamp: 1000 });
    collector.push('s2', { level: 'warn', text: 'b', timestamp: 2000 });
    expect(collector.get('s1')).toHaveLength(1);
    expect(collector.get('s2')).toHaveLength(1);
  });

  it('enforces ring buffer limit', () => {
    const collector = new ConsoleCollector(3);
    for (let i = 0; i < 5; i++) {
      collector.push('s1', { level: 'log', text: `msg-${i}`, timestamp: i });
    }
    const entries = collector.get('s1');
    expect(entries).toHaveLength(3);
    expect(entries[0].text).toBe('msg-2');
    expect(entries[2].text).toBe('msg-4');
  });

  it('clears session buffer', () => {
    const collector = new ConsoleCollector();
    collector.push('s1', { level: 'log', text: 'hello', timestamp: 1000 });
    collector.clear('s1');
    expect(collector.get('s1')).toEqual([]);
  });

  it('returns defensive copy', () => {
    const collector = new ConsoleCollector();
    collector.push('s1', { level: 'log', text: 'hello', timestamp: 1000 });
    const a = collector.get('s1');
    const b = collector.get('s1');
    expect(a).not.toBe(b);
  });
});
