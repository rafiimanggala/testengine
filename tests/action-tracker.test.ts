import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { Database } from '../src/database.js';
import { ActionTracker } from '../src/action-tracker.js';

const TEST_DB = 'test-action-tracker.db';
let db: Database;
let tracker: ActionTracker;

beforeEach(() => {
  db = new Database(TEST_DB);
  tracker = new ActionTracker(db);
  // Create a session so FK constraint is satisfied
  db.upsertSession({ id: 's1', url: 'http://test', mode: 'headless', status: 'running', port: 9100, containerId: 'c1' });
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe('ActionTracker', () => {
  it('records an action with params and result', () => {
    tracker.record('s1', 'click', { selector: '#btn' }, 'Clicked: #btn');
    const actions = tracker.getHistory('s1');
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe('click');
    expect(actions[0].paramsJson).toBe('{"selector":"#btn"}');
    expect(actions[0].resultJson).toBe('"Clicked: #btn"');
  });

  it('returns action count', () => {
    tracker.record('s1', 'click', { selector: '#a' }, 'ok');
    tracker.record('s1', 'type', { selector: '#b', text: 'hi' }, 'ok');
    expect(tracker.getCount('s1')).toBe(2);
  });

  it('returns last action', () => {
    tracker.record('s1', 'click', { selector: '#a' }, 'ok');
    tracker.record('s1', 'navigate', { url: '/dashboard' }, 'ok');
    const last = tracker.getLastAction('s1');
    expect(last).toBeDefined();
    expect(last!.action).toBe('navigate');
  });

  it('generates summary text', () => {
    tracker.record('s1', 'click', { selector: '#btn' }, 'Clicked: #btn');
    tracker.record('s1', 'navigate', { url: '/settings' }, 'Navigated to /settings (status: 200)');
    const summary = tracker.getSummaryText('s1', 'http://localhost:3000/settings');
    expect(summary).toContain('2 actions performed');
    expect(summary).toContain('last action: navigate');
    expect(summary).toContain('/settings');
  });

  it('returns minimal summary for no actions', () => {
    const summary = tracker.getSummaryText('s1', 'http://localhost:3000');
    expect(summary).toContain('0 actions performed');
  });
});
