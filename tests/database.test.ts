import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { Database } from '../src/database.js';

const TEST_DB = 'test-testengine.db';

let db: Database;

beforeEach(() => {
  db = new Database(TEST_DB);
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe('Database', () => {
  describe('sessions table', () => {
    it('upserts and retrieves a session', () => {
      db.upsertSession({
        id: 'test1',
        url: 'http://localhost:3000',
        mode: 'headless',
        status: 'running',
        port: 9100,
        containerId: 'abc123',
      });
      const session = db.getSession('test1');
      expect(session).toBeDefined();
      expect(session!.id).toBe('test1');
      expect(session!.url).toBe('http://localhost:3000');
      expect(session!.port).toBe(9100);
    });

    it('lists all sessions', () => {
      db.upsertSession({ id: 's1', url: 'http://a', mode: 'headless', status: 'running', port: 9100, containerId: 'c1' });
      db.upsertSession({ id: 's2', url: 'http://b', mode: 'visible', status: 'starting', port: 9101, containerId: 'c2' });
      expect(db.listSessions()).toHaveLength(2);
    });

    it('deletes a session', () => {
      db.upsertSession({ id: 's1', url: 'http://a', mode: 'headless', status: 'running', port: 9100, containerId: 'c1' });
      db.deleteSession('s1');
      expect(db.getSession('s1')).toBeUndefined();
    });

    it('updates session status', () => {
      db.upsertSession({ id: 's1', url: 'http://a', mode: 'headless', status: 'starting', port: 9100, containerId: 'c1' });
      db.updateSessionStatus('s1', 'running');
      expect(db.getSession('s1')!.status).toBe('running');
    });
  });

  describe('auth_store table', () => {
    it('saves and loads auth', () => {
      db.saveAuth('admin', '[]', '{}');
      const auth = db.getAuth('admin');
      expect(auth).toBeDefined();
      expect(auth!.cookiesJson).toBe('[]');
      expect(auth!.storageJson).toBe('{}');
    });

    it('lists saved auths', () => {
      db.saveAuth('admin', '[]', '{}');
      db.saveAuth('user', '[]', '{}');
      expect(db.listAuths()).toHaveLength(2);
    });

    it('deletes auth', () => {
      db.saveAuth('admin', '[]', '{}');
      db.deleteAuth('admin');
      expect(db.getAuth('admin')).toBeUndefined();
    });
  });

  describe('action_history table', () => {
    it('records and retrieves actions', () => {
      db.upsertSession({ id: 's1', url: 'http://a', mode: 'headless', status: 'running', port: 9100, containerId: 'c1' });
      db.recordAction('s1', 'click', '{"selector":"#btn"}', '"Clicked: #btn"');
      const actions = db.getActions('s1');
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe('click');
    });

    it('enforces ring buffer limit of 50', () => {
      db.upsertSession({ id: 's1', url: 'http://a', mode: 'headless', status: 'running', port: 9100, containerId: 'c1' });
      for (let i = 0; i < 60; i++) {
        db.recordAction('s1', `action_${i}`, '{}', '"ok"');
      }
      const actions = db.getActions('s1');
      expect(actions).toHaveLength(50);
      expect(actions[0].action).toBe('action_10');
    });

    it('counts actions per session', () => {
      db.upsertSession({ id: 's1', url: 'http://a', mode: 'headless', status: 'running', port: 9100, containerId: 'c1' });
      db.upsertSession({ id: 's2', url: 'http://b', mode: 'headless', status: 'running', port: 9101, containerId: 'c2' });
      db.recordAction('s1', 'click', '{}', '"ok"');
      db.recordAction('s1', 'type', '{}', '"ok"');
      db.recordAction('s2', 'click', '{}', '"ok"');
      expect(db.getActionCount('s1')).toBe(2);
      expect(db.getActionCount('s2')).toBe(1);
    });

    it('deletes actions when session deleted (CASCADE)', () => {
      db.upsertSession({ id: 's1', url: 'http://a', mode: 'headless', status: 'running', port: 9100, containerId: 'c1' });
      db.recordAction('s1', 'click', '{}', '"ok"');
      db.deleteSession('s1');
      expect(db.getActions('s1')).toHaveLength(0);
    });
  });

  describe('profiles table', () => {
    it('saves and retrieves a profile', () => {
      db.saveProfile({ name: 'biobrain', url: 'https://biobrain.tech', authName: 'admin' });
      const profile = db.getProfile('biobrain');
      expect(profile).toBeDefined();
      expect(profile!.url).toBe('https://biobrain.tech');
      expect(profile!.authName).toBe('admin');
    });

    it('lists profiles', () => {
      db.saveProfile({ name: 'p1', url: 'http://a' });
      db.saveProfile({ name: 'p2', url: 'http://b' });
      expect(db.listProfiles()).toHaveLength(2);
    });

    it('deletes a profile', () => {
      db.saveProfile({ name: 'p1', url: 'http://a' });
      db.deleteProfile('p1');
      expect(db.getProfile('p1')).toBeUndefined();
    });
  });
});
