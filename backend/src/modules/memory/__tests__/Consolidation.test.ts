import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';
import { TierConsolidationService } from '../consolidation/service.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL, summary TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'NOTE',
  tier TEXT NOT NULL DEFAULT 'WORKING', scope TEXT NOT NULL DEFAULT 'USER',
  user_id TEXT DEFAULT NULL, project_id TEXT DEFAULT NULL,
  source TEXT, source_ref TEXT, tags TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1.0, access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT, expires_at TEXT,
  pinned INTEGER NOT NULL DEFAULT 0, pin_order INTEGER NOT NULL DEFAULT 0,
  structured_map TEXT NOT NULL DEFAULT '{}', quality_score INTEGER DEFAULT NULL,
  archived INTEGER NOT NULL DEFAULT 0, agent_name TEXT DEFAULT NULL,
  owner TEXT DEFAULT NULL, epoch_id TEXT DEFAULT NULL, superseded_by INTEGER DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS consolidation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL, from_tier TEXT NOT NULL, to_tier TEXT NOT NULL,
  reason TEXT NOT NULL, consolidated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);
`;

async function makeService(): Promise<{ svc: TierConsolidationService; db: SqliteAdapter }> {
  const db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(SCHEMA);
  const adapter = new SqliteDbAdapter(db);
  const svc = new TierConsolidationService(adapter, {
    workingToEpisodicMinHours: 0,
    workingToEpisodicMinAccess: 0,
    workingToEpisodicMinQuality: 0,
    episodicToSemanticMinDays: 0,
    episodicToSemanticMinAccess: 0,
    episodicToSemanticMinQuality: 0,
    batchSize: 100,
  });
  return { svc, db };
}

describe('TierConsolidationService', () => {
  let svc: TierConsolidationService;
  let db: SqliteAdapter;

  beforeEach(async () => { const m = await makeService(); svc = m.svc; db = m.db; });
  afterEach(async () => { await db.disconnect(); });

  function insert(overrides: Record<string, unknown> = {}): number {
    const cols = ['content', 'summary', 'type', 'tier', 'access_count', 'quality_score', 'structured_map', 'archived', 'expires_at', 'last_accessed_at'];
    const vals: Record<string, unknown> = {
      content: 'test', summary: 'test', type: 'NOTE', tier: 'WORKING',
      access_count: 0, quality_score: 0, structured_map: '{}', archived: 0,
      expires_at: null, last_accessed_at: null,
      ...overrides,
    };
    const stmt = db.prepare(`INSERT INTO knowledge_entries (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    const r = stmt.run(...cols.map(c => vals[c]));
    return r.lastInsertRowid as number;
  }

  it('promotes WORKING to EPISODIC when criteria met', async () => {
    insert({ tier: 'WORKING', access_count: 5, quality_score: 60 });
    const r = await svc.runConsolidation(false, 'EPISODIC');
    expect(r.promoted).toBe(1);
    expect(r.demoted).toBe(0);
    const row = await db.get<any>('SELECT tier FROM knowledge_entries WHERE id = 1');
    expect(row.tier).toBe('EPISODIC');
  });

  it('dry run does not modify tiers', async () => {
    insert({ tier: 'WORKING', access_count: 5, quality_score: 60 });
    const r = await svc.runConsolidation(true, 'EPISODIC');
    expect(r.promoted).toBe(1);
    const row = await db.get<any>('SELECT tier FROM knowledge_entries WHERE id = 1');
    expect(row.tier).toBe('WORKING');
  });

  it('promotes EPISODIC to SEMANTIC with structured_map', async () => {
    insert({ tier: 'EPISODIC', access_count: 15, quality_score: 80, structured_map: '{"steps":[{"tool":"test"}]}' });
    const r = await svc.runConsolidation(false);
    expect(r.promoted).toBe(1);
    const row = await db.get<any>('SELECT tier FROM knowledge_entries WHERE id = 1');
    expect(row.tier).toBe('SEMANTIC');
  });

  it('skips EPISODIC with empty structured_map', async () => {
    insert({ tier: 'EPISODIC', access_count: 15, quality_score: 80, structured_map: '{}' });
    const r = await svc.runConsolidation(false);
    expect(r.promoted).toBe(0);
  });

  it('archives expired entries', async () => {
    insert({ tier: 'SEMANTIC', expires_at: '2020-01-01' });
    const r = await svc.runConsolidation(false);
    expect(r.expired).toBe(1);
    const row = await db.get<any>('SELECT archived FROM knowledge_entries WHERE id = 1');
    expect(row.archived).toBe(1);
  });

  it('logs consolidation to consolidation_log', async () => {
    insert({ tier: 'WORKING', access_count: 5, quality_score: 60 });
    await svc.runConsolidation(false, 'EPISODIC');
    const log = await db.all<any>('SELECT * FROM consolidation_log');
    expect(log).toHaveLength(1);
    expect(log[0].entry_id).toBe(1);
    expect(log[0].from_tier).toBe('WORKING');
    expect(log[0].to_tier).toBe('EPISODIC');
  });

  it('promotes full chain WORKING→EPISODIC→SEMANTIC', async () => {
    insert({ tier: 'WORKING', access_count: 20, quality_score: 90, structured_map: '{"key":"val"}' });
    const r = await svc.runConsolidation(false);
    expect(r.promoted).toBe(2);
    const row = await db.get<any>('SELECT tier FROM knowledge_entries WHERE id = 1');
    expect(row.tier).toBe('SEMANTIC');
  });

  it('config get/set works', () => {
    const cfg = svc.getConfig();
    expect(cfg.workingToEpisodicMinHours).toBe(0);
    svc.updateConfig({ workingToEpisodicMinHours: 48 });
    expect(svc.getConfig().workingToEpisodicMinHours).toBe(48);
  });

  it('returns zero for empty DB', async () => {
    const r = await svc.runConsolidation(false);
    expect(r.promoted).toBe(0);
    expect(r.demoted).toBe(0);
    expect(r.expired).toBe(0);
  });

  it('skips archived entries', async () => {
    insert({ tier: 'WORKING', access_count: 5, quality_score: 60, archived: 1 });
    const r = await svc.runConsolidation(false, 'EPISODIC');
    expect(r.promoted).toBe(0);
  });

  it('target_tier limits promotion scope', async () => {
    insert({ tier: 'WORKING', access_count: 5, quality_score: 60 });
    insert({ tier: 'EPISODIC', access_count: 15, quality_score: 80, structured_map: '{"x":"y"}' });
    const r = await svc.runConsolidation(false, 'WORKING');
    expect(r.promoted).toBe(0);
    const row2 = await db.get<any>('SELECT tier FROM knowledge_entries WHERE id = 2');
    expect(row2.tier).toBe('EPISODIC');
  });
});
