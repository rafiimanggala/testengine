// tests/network-collector.test.ts
import { describe, it, expect } from 'vitest';
import { NetworkCollector } from '../src/network-collector.js';

describe('NetworkCollector', () => {
  it('starts with empty buffer', () => {
    const collector = new NetworkCollector();
    expect(collector.get('s1')).toEqual([]);
  });

  it('records request then response pair', () => {
    const collector = new NetworkCollector();
    collector.recordRequest('s1', 'https://api.example.com/data', 'GET');
    collector.recordResponse('s1', 'https://api.example.com/data', 'GET', 200, 'fetch');
    const entries = collector.get('s1');
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://api.example.com/data');
    expect(entries[0].method).toBe('GET');
    expect(entries[0].status).toBe(200);
    expect(entries[0].resourceType).toBe('fetch');
    expect(entries[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('handles response without prior request', () => {
    const collector = new NetworkCollector();
    collector.recordResponse('s1', 'https://x.com', 'GET', 200, 'document');
    const entries = collector.get('s1');
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe(200);
  });

  it('filters by URL pattern', () => {
    const collector = new NetworkCollector();
    collector.recordResponse('s1', 'https://api.example.com/users', 'GET', 200, 'fetch');
    collector.recordResponse('s1', 'https://cdn.example.com/img.png', 'GET', 200, 'image');
    collector.recordResponse('s1', 'https://api.example.com/posts', 'GET', 200, 'fetch');
    const filtered = collector.get('s1', 'api.example.com');
    expect(filtered).toHaveLength(2);
  });

  it('enforces ring buffer limit', () => {
    const collector = new NetworkCollector(3);
    for (let i = 0; i < 5; i++) {
      collector.recordResponse('s1', `https://api.com/${i}`, 'GET', 200, 'fetch');
    }
    const entries = collector.get('s1');
    expect(entries).toHaveLength(3);
    expect(entries[0].url).toBe('https://api.com/2');
  });

  it('isolates sessions', () => {
    const collector = new NetworkCollector();
    collector.recordResponse('s1', 'https://a.com', 'GET', 200, 'fetch');
    collector.recordResponse('s2', 'https://b.com', 'GET', 200, 'fetch');
    expect(collector.get('s1')).toHaveLength(1);
    expect(collector.get('s2')).toHaveLength(1);
  });

  it('clears session data', () => {
    const collector = new NetworkCollector();
    collector.recordRequest('s1', 'https://a.com', 'GET');
    collector.recordResponse('s1', 'https://a.com', 'GET', 200, 'fetch');
    collector.clear('s1');
    expect(collector.get('s1')).toEqual([]);
  });
});
