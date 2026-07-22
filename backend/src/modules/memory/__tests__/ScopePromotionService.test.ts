/**
 * Unit Tests — ScopePromotionService (KSA-295)
 * Covers: scan criteria, queue, approve, reject (no cooldown), promoteOnMerge, requestShared.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import pino from 'pino';
import { ScopePromotionService } from '../promotion/index.js';
import { MEMORY_SCHEMA } from '../schema/index.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(MEMORY_SCHEMA);
  return db;
}

const logger = pino({ level: 'silent' });

function seedEntry(db: Database.Database, overrides: Record<string, any> = {}): number {
  const defaults = {
    content: 'test content', summary: 'test', type: 'CONTEXT',
    tier: 'WORKING', scope: 'USER', user_id: 'user-1',
    tags: '', confidence: 1.0, access_count: 0,
    created_at: new Date(Date.now() - 48 * 3600_000).toISOString(),
  };
  const d = { ...defaults, ...overrides };
  const r = db.prepare(`
    INSERT INTO knowledge_entries (content, summary, type, tier, scope, user_id, tags, confidence, access_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(d.content, d.summary, d.type, d.tier, d.scope, d.user_id, d.tags, d.confidence, d.access_count, d.created_at);
  return r.lastInsertRowid as number;
}

function addCitation(db: Database.Database, entryId: number, citedBy: string): void {
  db.prepare('INSERT INTO citations (entry_id, cited_by) VALUES (?, ?)').run(entryId, citedBy);
}

describe('ScopePromotionService', () => {
  let db: Database.Database;
  let svc: ScopePromotionService;

  beforeEach(() => {
    db = createTestDb();
    svc = new ScopePromotionService(new SqliteDbAdapter(db), logger);
  });

  describe('scanForPromotionCandidates', () => {
    it('detects entry meeting 2+ criteria', async () => {
      const id = seedEntry(db, { access_count: 8, quality_score: 80 });
      addCitation(db, id, 'agent-ba');
      addCitation(db, id, 'agent-sa');
      addCitation(db, id, 'agent-dev');

      const candidates = await svc.scanForPromotionCandidates();
      expect(candidates.length).toBe(1);
      expect(candidates[0].entryId).toBe(id);
      expect(candidates[0].targetScope).toBe('PROJECT');
      expect(candidates[0].score).toBeGreaterThan(0);
    });

    it('skips entry meeting only 1 criterion', async () => {
      seedEntry(db, { access_count: 10 });
      const candidates = await svc.scanForPromotionCandidates();
      expect(candidates.length).toBe(0);
    });

    it('skips entries younger than 24h', async () => {
      const id = seedEntry(db, {
        access_count: 20, quality_score: 90,
        created_at: new Date().toISOString(),
      });
      addCitation(db, id, 'a1');
      addCitation(db, id, 'a2');
      addCitation(db, id, 'a3');
      const candidates = await svc.scanForPromotionCandidates();
      expect(candidates.length).toBe(0);
    });

    it('skips already-queued entries', async () => {
      const id = seedEntry(db, { access_count: 8, quality_score: 80 });
      addCitation(db, id, 'a1');
      addCitation(db, id, 'a2');
      await svc.queueCandidates(await svc.scanForPromotionCandidates());
      const c2 = await svc.scanForPromotionCandidates();
      expect(c2.length).toBe(0);
    });
  });

  describe('approve', () => {
    it('changes entry scope USER to PROJECT', async () => {
      const id = seedEntry(db, { access_count: 8, quality_score: 80 });
      addCitation(db, id, 'a1');
      addCitation(db, id, 'a2');
      await svc.queueCandidates(await svc.scanForPromotionCandidates());
      expect(svc.approve(id, 'admin-001', 'Good')).toBe(true);
      const e = db.prepare('SELECT scope FROM knowledge_entries WHERE id = ?').get(id) as any;
      expect(e.scope).toBe('PROJECT');
    });

    it('returns false for non-pending', () => {
      expect(svc.approve(999, 'admin', 'x')).toBe(false);
    });
  });

  describe('reject', () => {
    it('no cooldown — entry re-scannable', async () => {
      const id = seedEntry(db, { access_count: 8, quality_score: 80 });
      addCitation(db, id, 'a1');
      addCitation(db, id, 'a2');
      await svc.queueCandidates(await svc.scanForPromotionCandidates());
      expect(svc.reject(id, 'admin', 'Not ready')).toBe(true);
      const e = db.prepare('SELECT scope FROM knowledge_entries WHERE id = ?').get(id) as any;
      expect(e.scope).toBe('USER');
      const q = db.prepare('SELECT cooldown_until FROM kb_promotion_queue WHERE entry_id = ?').get(id) as any;
      expect(q.cooldown_until).toBeNull();
    });
  });

  describe('promoteOnMerge', () => {
    it('promotes matching USER entries', async () => {
      const id1 = seedEntry(db, { tags: 'KSA-295,arch' });
      const id2 = seedEntry(db, { summary: 'KSA-295 req' });
      seedEntry(db, { tags: 'KSA-100' });
      const { promoted } = await svc.promoteOnMerge('KSA-295');
      expect(promoted).toBe(2);
      expect((db.prepare('SELECT scope FROM knowledge_entries WHERE id=?').get(id1) as any).scope).toBe('PROJECT');
      expect((db.prepare('SELECT scope FROM knowledge_entries WHERE id=?').get(id2) as any).scope).toBe('PROJECT');
    });

    it('skips non-USER entries (not matched by query)', async () => {
      seedEntry(db, { tags: 'KSA-295', scope: 'PROJECT' });
      const { promoted, skipped } = await svc.promoteOnMerge('KSA-295');
      expect(promoted).toBe(0);
      expect(skipped).toBe(0); // PROJECT entries not in WHERE scope='USER' query
    });
  });

  describe('requestSharedPromotion', () => {
    it('creates PENDING for PROJECT entry', () => {
      const id = seedEntry(db, { scope: 'PROJECT' });
      expect(svc.requestSharedPromotion(id, 'Cross-project')).toBe(true);
      const q = db.prepare('SELECT * FROM kb_promotion_queue WHERE entry_id=?').get(id) as any;
      expect(q.target_tier).toBe('SHARED');
      expect(q.status).toBe('PENDING');
    });

    it('returns false for USER entry', () => {
      const id = seedEntry(db, { scope: 'USER' });
      expect(svc.requestSharedPromotion(id, 'x')).toBe(false);
    });

    it('blocks duplicate', () => {
      const id = seedEntry(db, { scope: 'PROJECT' });
      svc.requestSharedPromotion(id, 'first');
      expect(svc.requestSharedPromotion(id, 'second')).toBe(false);
    });
  });
});
