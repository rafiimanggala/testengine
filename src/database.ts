import { mkdirSync } from 'fs';
import { dirname } from 'path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';

export interface SessionRow {
  id: string;
  url: string;
  mode: string;
  status: string;
  port: number;
  containerId: string;
  viewerPort: number | null;
  createdAt: string;
}

export interface AuthRow {
  name: string;
  cookiesJson: string;
  storageJson: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface ActionRow {
  id: number;
  sessionId: string;
  action: string;
  paramsJson: string | null;
  resultJson: string | null;
  timestamp: string;
}

export interface ProfileRow {
  name: string;
  url: string;
  authName: string | null;
  viewportJson: string | null;
  configJson: string | null;
}

const RING_BUFFER_LIMIT = 50;

export class Database {
  private db: BetterSqlite3Database;

  constructor(dbPath: string = 'data/testengine.db') {
    const dir = dirname(dbPath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'headless',
        status TEXT NOT NULL DEFAULT 'starting',
        port INTEGER NOT NULL,
        container_id TEXT NOT NULL,
        viewer_port INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS auth_store (
        name TEXT PRIMARY KEY,
        cookies_json TEXT NOT NULL,
        storage_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
      );

      CREATE TABLE IF NOT EXISTS action_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        params_json TEXT,
        result_json TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS profiles (
        name TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        auth_name TEXT,
        viewport_json TEXT,
        config_json TEXT
      );
    `);
  }

  // === Sessions ===

  upsertSession(s: { id: string; url: string; mode: string; status: string; port: number; containerId: string; viewerPort?: number }): void {
    this.db.prepare(`
      INSERT INTO sessions (id, url, mode, status, port, container_id, viewer_port)
      VALUES (@id, @url, @mode, @status, @port, @containerId, @viewerPort)
      ON CONFLICT(id) DO UPDATE SET
        url = @url, mode = @mode, status = @status, port = @port,
        container_id = @containerId, viewer_port = @viewerPort
    `).run({ ...s, viewerPort: s.viewerPort ?? null });
  }

  getSession(id: string): SessionRow | undefined {
    return this.db.prepare(`
      SELECT id, url, mode, status, port, container_id AS containerId, viewer_port AS viewerPort, created_at AS createdAt
      FROM sessions WHERE id = ?
    `).get(id) as SessionRow | undefined;
  }

  listSessions(): SessionRow[] {
    return this.db.prepare(`
      SELECT id, url, mode, status, port, container_id AS containerId, viewer_port AS viewerPort, created_at AS createdAt
      FROM sessions ORDER BY created_at
    `).all() as SessionRow[];
  }

  updateSessionStatus(id: string, status: string): void {
    this.db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id);
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  // === Auth Store ===

  saveAuth(name: string, cookiesJson: string, storageJson: string, expiresAt?: string): void {
    this.db.prepare(`
      INSERT INTO auth_store (name, cookies_json, storage_json, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        cookies_json = excluded.cookies_json, storage_json = excluded.storage_json, expires_at = excluded.expires_at
    `).run(name, cookiesJson, storageJson, expiresAt ?? null);
  }

  getAuth(name: string): AuthRow | undefined {
    return this.db.prepare(`
      SELECT name, cookies_json AS cookiesJson, storage_json AS storageJson, created_at AS createdAt, expires_at AS expiresAt
      FROM auth_store WHERE name = ?
    `).get(name) as AuthRow | undefined;
  }

  listAuths(): AuthRow[] {
    return this.db.prepare(`
      SELECT name, cookies_json AS cookiesJson, storage_json AS storageJson, created_at AS createdAt, expires_at AS expiresAt
      FROM auth_store ORDER BY created_at
    `).all() as AuthRow[];
  }

  deleteAuth(name: string): void {
    this.db.prepare('DELETE FROM auth_store WHERE name = ?').run(name);
  }

  // === Action History ===

  recordAction(sessionId: string, action: string, paramsJson: string | null, resultJson: string | null): void {
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO action_history (session_id, action, params_json, result_json)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, action, paramsJson, resultJson);

      const count = this.getActionCount(sessionId);
      if (count > RING_BUFFER_LIMIT) {
        this.db.prepare(`
          DELETE FROM action_history WHERE id IN (
            SELECT id FROM action_history WHERE session_id = ? ORDER BY id ASC LIMIT ?
          )
        `).run(sessionId, count - RING_BUFFER_LIMIT);
      }
    })();
  }

  getActions(sessionId: string, limit: number = RING_BUFFER_LIMIT): ActionRow[] {
    return this.db.prepare(`
      SELECT id, session_id AS sessionId, action, params_json AS paramsJson, result_json AS resultJson, timestamp
      FROM action_history WHERE session_id = ? ORDER BY id ASC LIMIT ?
    `).all(sessionId, limit) as ActionRow[];
  }

  getLastAction(sessionId: string): ActionRow | undefined {
    return this.db.prepare(`
      SELECT id, session_id AS sessionId, action, params_json AS paramsJson, result_json AS resultJson, timestamp
      FROM action_history WHERE session_id = ? ORDER BY id DESC LIMIT 1
    `).get(sessionId) as ActionRow | undefined;
  }

  getActionCount(sessionId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM action_history WHERE session_id = ?').get(sessionId) as { count: number };
    return row.count;
  }

  deleteActions(sessionId: string): void {
    this.db.prepare('DELETE FROM action_history WHERE session_id = ?').run(sessionId);
  }

  // === Profiles ===

  saveProfile(p: { name: string; url: string; authName?: string; viewportJson?: string; configJson?: string }): void {
    this.db.prepare(`
      INSERT INTO profiles (name, url, auth_name, viewport_json, config_json)
      VALUES (@name, @url, @authName, @viewportJson, @configJson)
      ON CONFLICT(name) DO UPDATE SET
        url = @url, auth_name = @authName, viewport_json = @viewportJson, config_json = @configJson
    `).run({
      name: p.name,
      url: p.url,
      authName: p.authName ?? null,
      viewportJson: p.viewportJson ?? null,
      configJson: p.configJson ?? null,
    });
  }

  getProfile(name: string): ProfileRow | undefined {
    return this.db.prepare(`
      SELECT name, url, auth_name AS authName, viewport_json AS viewportJson, config_json AS configJson
      FROM profiles WHERE name = ?
    `).get(name) as ProfileRow | undefined;
  }

  listProfiles(): ProfileRow[] {
    return this.db.prepare(`
      SELECT name, url, auth_name AS authName, viewport_json AS viewportJson, config_json AS configJson
      FROM profiles ORDER BY name
    `).all() as ProfileRow[];
  }

  deleteProfile(name: string): void {
    this.db.prepare('DELETE FROM profiles WHERE name = ?').run(name);
  }

  // === Lifecycle ===

  close(): void {
    this.db.close();
  }
}
