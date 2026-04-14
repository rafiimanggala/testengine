import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { Database } from '../src/database.js';
import { SessionManager } from '../src/session-manager.js';

const TEST_DB = 'test-session-persist.db';
let db: Database;

beforeEach(() => {
  db = new Database(TEST_DB);
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe('SessionManager persistence', () => {
  it('persists session to DB on create', async () => {
    const mockDocker = {
      createContainer: vi.fn().mockResolvedValue({
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
      }),
    } as any;

    const sm = new SessionManager(mockDocker, 9100, db);
    await sm.create('test1', 'http://example.com');

    const row = db.getSession('test1');
    expect(row).toBeDefined();
    expect(row!.containerId).toBe('container-123');
    expect(row!.status).toBe('starting');
  });

  it('removes session from DB on destroy', async () => {
    const mockDocker = {
      createContainer: vi.fn().mockResolvedValue({
        id: 'container-123',
        start: vi.fn().mockResolvedValue(undefined),
      }),
      getContainer: vi.fn().mockReturnValue({
        stop: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      }),
    } as any;

    const sm = new SessionManager(mockDocker, 9100, db);
    await sm.create('test1', 'http://example.com');
    await sm.destroy('test1');

    expect(db.getSession('test1')).toBeUndefined();
  });

  it('updates status in DB via setStatus', async () => {
    const mockDocker = {
      createContainer: vi.fn().mockResolvedValue({
        id: 'c1',
        start: vi.fn().mockResolvedValue(undefined),
      }),
    } as any;

    const sm = new SessionManager(mockDocker, 9100, db);
    await sm.create('test1', 'http://example.com');
    sm.setStatus('test1', 'running');

    expect(db.getSession('test1')!.status).toBe('running');
  });

  it('cleans up stale sessions from DB on construction', () => {
    // Pre-populate DB with a stale session
    db.upsertSession({
      id: 'stale1',
      url: 'http://old',
      mode: 'headless',
      status: 'running',
      port: 9100,
      containerId: 'old-container',
    });

    const mockDocker = {} as any;
    const sm = new SessionManager(mockDocker, 9100, db);

    // Stale sessions should be cleaned up from DB
    const sessions = sm.list();
    expect(sessions).toHaveLength(0);
    expect(db.getSession('stale1')).toBeUndefined();
  });
});
