import { describe, it, expect } from 'vitest';
import { rewriteUrl } from '../src/url-rewriter.js';

describe('rewriteUrl', () => {
  it('rewrites localhost to host.docker.internal', () => {
    expect(rewriteUrl('http://localhost:3000')).toBe('http://host.docker.internal:3000');
  });

  it('rewrites 127.0.0.1 to host.docker.internal', () => {
    expect(rewriteUrl('http://127.0.0.1:8080/path')).toBe('http://host.docker.internal:8080/path');
  });

  it('does not rewrite external URLs', () => {
    expect(rewriteUrl('https://example.com')).toBe('https://example.com');
  });

  it('preserves path and query', () => {
    expect(rewriteUrl('http://localhost:3000/api?key=val')).toBe('http://host.docker.internal:3000/api?key=val');
  });

  it('handles localhost without port', () => {
    expect(rewriteUrl('http://localhost/app')).toBe('http://host.docker.internal/app');
  });
});
