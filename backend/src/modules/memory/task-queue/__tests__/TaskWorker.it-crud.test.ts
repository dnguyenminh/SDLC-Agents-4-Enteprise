/**
 * IT-01/IT-01b: TaskWorker Integration Tests — CRUD lifecycle + priority queue.
 * Full pipeline integration with in-memory SQLite and mocked LLM.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PendingTaskRepository } from '../PendingTaskRepository.js';
import { TaskType } from '../models.js';
import { createWorkerHarness, type WorkerHarness } from './helpers.js';

describe('TaskWorker Integration Tests', () => {
  let harness: WorkerHarness;
  let db: WorkerHarness['db'];
  let adapter: WorkerHarness['adapter'];
  let engine: WorkerHarness['engine'];
  let worker: WorkerHarness['worker'];

  beforeEach(async () => {
    harness = await createWorkerHarness();
    db = harness.db;
    adapter = harness.adapter;
    engine = harness.engine;
    worker = harness.worker;
  });

  // IT-01: Full CRUD lifecycle
  describe('IT-01: Full CRUD lifecycle', () => {
    it('creates entry, processes task, and updates structured_map', async () => {
      const id = await engine.insert({
        content: 'Authentication flow with JWT tokens and user login',
        summary: 'Auth section',
        type: 'CONTEXT',
        tier: 'WORKING',
        source: '/doc.md',
        tags: '',
      });
      const row = await db.get('SELECT structured_map FROM knowledge_entries WHERE id = ?', [id]);
      expect(row).toBeTruthy();

      const repo = new PendingTaskRepository(adapter);
      await repo.create({
        task_type: TaskType.TAG_ENRICHMENT,
        entry_id: id,
        payload: { entry_id: id, content: 'Authentication flow with JWT tokens and user login', existing_tags: '', options: { threshold: 0.7 } },
      });

      // Claim and process the task
      const task = await repo.claimNext();
      expect(task).not.toBeNull();
      const payload = JSON.parse(task!.payload);
      await (worker as any).processTagEnrichment(task!, payload);

      const entry = await engine.findById(id);
      expect(entry).toBeDefined();
      expect(entry!.tags).toContain('auth-flow-login');

      const sm = JSON.parse(entry!.structured_map);
      expect(sm.tags).toContain('auth-flow-login');
      expect(sm.summary).toBe('Describes authentication flow.');
      expect(sm.business_entities).toEqual(['User', 'JWT Token']);
      expect(sm.actors).toEqual(['End User']);
      expect(sm.business_rules).toEqual(['JWT expires after 24h']);
      expect(sm.extraction_meta).toBeDefined();
      expect(sm.extraction_meta.model).toBe('test-model');
      expect(sm.extraction_meta.fallback_used).toBe(false);
      expect(sm.extraction_meta.context_chain_enabled).toBe(true);
    });
  });

  // IT-01b: SA4E-155 priority ordering — HIGH claimed before NORMAL, FIFO within same priority
  describe('IT-01b: priority queue ordering', () => {
    it('claimNext/claimBatch return highest priority first, then created_at ASC', async () => {
      const repo = new PendingTaskRepository(adapter);
      const e1 = await engine.insert({ content: 'a', summary: 'a', type: 'CONTEXT', tier: 'WORKING', source: '/a.md', tags: '' });
      const e2 = await engine.insert({ content: 'b', summary: 'b', type: 'CONTEXT', tier: 'WORKING', source: '/b.md', tags: '' });
      const e3 = await engine.insert({ content: 'c', summary: 'c', type: 'CONTEXT', tier: 'WORKING', source: '/c.md', tags: '' });
      await repo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: e1, payload: { x: 1 } });
      await repo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: e2, payload: { x: 1 }, priority: 100 });
      await repo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: e3, payload: { x: 1 }, priority: 100 });

      const first = await repo.claimNext();
      expect(first!.entry_id).toBe(e2); // higher priority, earlier created

      const batch = await repo.claimBatch(5);
      const claimedIds = batch.map(t => t.entry_id);
      expect(claimedIds).toContain(e3);
      expect(claimedIds).toContain(e1);
      // e3 (priority 100) must come before e1 (priority 0)
      expect(claimedIds.indexOf(e3)).toBeLessThan(claimedIds.indexOf(e1));
    });
  });
});
