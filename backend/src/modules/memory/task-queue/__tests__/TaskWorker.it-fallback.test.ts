/**
 * IT-03/IT-04/IT-07: TaskWorker Integration Tests — backward compat, LLM
 * timeout fallback, structured_map failure resilience.
 * Full pipeline integration with in-memory SQLite and mocked LLM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PendingTaskRepository } from '../PendingTaskRepository.js';
import { TaskType } from '../models.js';
import { createWorkerHarness, type WorkerHarness } from './helpers.js';

describe('TaskWorker Integration Tests', () => {
  let harness: WorkerHarness;
  let db: WorkerHarness['db'];
  let adapter: WorkerHarness['adapter'];
  let engine: WorkerHarness['engine'];
  let llm: WorkerHarness['llm'];
  let worker: WorkerHarness['worker'];

  beforeEach(async () => {
    harness = await createWorkerHarness();
    db = harness.db;
    adapter = harness.adapter;
    engine = harness.engine;
    llm = harness.llm;
    worker = harness.worker;
  });

  // IT-03: Backward compatibility — Old entry with structured_map='{}'
  describe('IT-03: Backward compatibility', () => {
    it('processes old entry with structured_map="{}" without errors', async () => {
      const id = await engine.insert({
        content: 'Legacy content',
        summary: 'Legacy',
        type: 'CONTEXT',
        tier: 'WORKING',
        tags: '',
      });
      await db.run('UPDATE knowledge_entries SET structured_map = ? WHERE id = ?', ['{}', id]);

      const repo = new PendingTaskRepository(adapter);
      const taskId = await repo.create({
        task_type: TaskType.TAG_ENRICHMENT,
        entry_id: id,
        payload: { entry_id: id, content: 'Legacy content', existing_tags: '' },
      });
      const task = await repo.findById(taskId);
      const payload = JSON.parse(task!.payload);
      await (worker as any).processTagEnrichment(task!, payload);

      const entry = await engine.findById(id);
      const sm = JSON.parse(entry!.structured_map);
      expect(sm.tags).toBeDefined();
      expect(sm.extraction_meta).toBeDefined();
    });

    it('processes old entry with minimal structured_map without errors', async () => {
      const id = await engine.insert({
        content: 'Minimal map content',
        summary: 'Minimal map',
        type: 'CONTEXT',
        tier: 'WORKING',
        tags: '',
      });
      // structured_map is NOT NULL DEFAULT '{}', so we keep it as '{}'

      const repo = new PendingTaskRepository(adapter);
      const taskId = await repo.create({
        task_type: TaskType.TAG_ENRICHMENT,
        entry_id: id,
        payload: { entry_id: id, content: 'Minimal map content', existing_tags: '' },
      });
      const task = await repo.findById(taskId);
      const payload = JSON.parse(task!.payload);
      await (worker as any).processTagEnrichment(task!, payload);

      const entry = await engine.findById(id);
      const sm = JSON.parse(entry!.structured_map);
      expect(sm.tags).toBeDefined();
    });
  });

  // IT-04: LLM timeout → fallback extraction
  describe('IT-04: LLM timeout fallback', () => {
    it('uses fallback extraction when LLM times out, still updates structured_map', async () => {
      vi.mocked(llm.complete).mockRejectedValue(new Error('LLM timeout'));

      const id = await engine.insert({
        content: 'Error: bug fix for login decision',
        summary: 'Bug fix',
        type: 'CONTEXT',
        tier: 'WORKING',
        tags: '',
      });

      const repo = new PendingTaskRepository(adapter);
      const taskId = await repo.create({
        task_type: TaskType.TAG_ENRICHMENT,
        entry_id: id,
        payload: { entry_id: id, content: 'Error: bug fix for login decision', existing_tags: '' },
      });
      const task = await repo.findById(taskId);
      const payload = JSON.parse(task!.payload);
      await (worker as any).processTagEnrichment(task!, payload);

      const entry = await engine.findById(id);
      // SA4E-155: LLM failure triggers fallback extraction which DOES update tags
      expect(entry!.tags).not.toBe('');

      const sm = JSON.parse(entry!.structured_map);
      expect(sm.extraction_meta.fallback_used).toBe(true);
    });
  });

  // IT-07: structured_map update fails — Tags still updated
  describe('IT-07: structured_map fail -> tags still update', () => {
    it('updates tags even when structured_map update fails', async () => {
      // Mock adapter.runAsync to throw only for structured_map updates
      const origRunAsync = adapter.runAsync.bind(adapter);
      vi.spyOn(adapter, 'runAsync').mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes('structured_map = ?') && sql.includes('WHERE id')) {
          throw new Error('DB write error');
        }
        return origRunAsync(sql, params);
      });

      const id = await engine.insert({
        content: 'Test content for tag persistence',
        summary: 'Test',
        type: 'CONTEXT',
        tier: 'WORKING',
        tags: '',
      });

      const repo = new PendingTaskRepository(adapter);
      const taskId = await repo.create({
        task_type: TaskType.TAG_ENRICHMENT,
        entry_id: id,
        payload: { entry_id: id, content: 'Test content for tag persistence', existing_tags: '' },
      });
      const task = await repo.findById(taskId);
      const payload = JSON.parse(task!.payload);
      await (worker as any).processTagEnrichment(task!, payload);

      const entry = await engine.findById(id);
      // Tags should be updated despite structured_map failure
      expect(entry!.tags).toContain('auth-flow-login');

      // structured_map should remain as original '{}'
      const sm = JSON.parse(entry!.structured_map);
      expect(sm.tags).toBeUndefined(); // Not updated
    });
  });
});
