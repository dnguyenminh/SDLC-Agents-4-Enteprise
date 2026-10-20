/**
 * IT-02/IT-05/IT-06: TaskWorker Integration Tests — context chain behaviour.
 * Full pipeline integration with in-memory SQLite and mocked LLM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PendingTaskRepository } from '../PendingTaskRepository.js';
import { TaskType } from '../models.js';
import { TaskWorker } from '../TaskWorker.js';
import { createWorkerHarness, testConfig, logger, type WorkerHarness } from './helpers.js';

describe('TaskWorker Integration Tests', () => {
  let harness: WorkerHarness;
  let adapter: WorkerHarness['adapter'];
  let engine: WorkerHarness['engine'];
  let analyzer: WorkerHarness['analyzer'];
  let llm: WorkerHarness['llm'];
  let worker: WorkerHarness['worker'];

  beforeEach(async () => {
    harness = await createWorkerHarness();
    adapter = harness.adapter;
    engine = harness.engine;
    analyzer = harness.analyzer;
    llm = harness.llm;
    worker = harness.worker;
  });

  // IT-02: Context chain — Section 2 receives section 1 summary
  describe('IT-02: Context chain between sections', () => {
    it('passes section 1 summary as context to section 2', async () => {
      // Insert section 1 with structured_map containing summary
      const id1 = await engine.insert({
        content: 'Section 1 about auth',
        summary: 'Auth summary',
        type: 'CONTEXT',
        tier: 'WORKING',
        source: '/doc.md',
        tags: 'auth',
      });
      engine.updateStructuredMap(id1, JSON.stringify({
        tags: ['auth'],
        summary: 'Auth flow description',
        business_entities: ['User'],
        actors: ['Admin'],
        extraction_meta: { model: 'test', timestamp: '2026-01-01', fallback_used: false, context_chain_enabled: true },
      }));

      // Insert section 2
      const id2 = await engine.insert({
        content: 'Section 2 about auth',
        summary: 'Auth section 2',
        type: 'CONTEXT',
        tier: 'WORKING',
        source: '/doc.md',
        tags: '',
      });

      // Use the real DB for the context chain lookup — query by source
      // Both entries share the same source, so loadPreviousContext will find entry 1
      const repo = new PendingTaskRepository(adapter);
      const taskId = await repo.create({
        task_type: TaskType.TAG_ENRICHMENT,
        entry_id: id2,
        payload: { entry_id: id2, content: 'Section 2 content', existing_tags: '', source: '/doc.md' },
      });
      const task = await repo.findById(taskId);
      const payload = JSON.parse(task!.payload);

      // Spy on loadPreviousContext to verify it's called
      const loadCtxSpy = vi.spyOn(worker as any, 'loadPreviousContext');
      await (worker as any).processTagEnrichment(task!, payload);

      expect(loadCtxSpy).toHaveBeenCalledWith(id2, '/doc.md');
      const entry2 = await engine.findById(id2);
      const sm2 = JSON.parse(entry2!.structured_map);
      expect(sm2.context_chain).toBeDefined();
      expect(sm2.context_chain.previous_section_id).toBe(id1);
    });
  });

  // IT-05: Context chain disabled
  describe('IT-05: Context chain disabled', () => {
    it('does not apply context chain when config disabled', async () => {
      const workerNoContext = new TaskWorker(adapter, engine, logger, { ...testConfig, enableContextChain: false });
      workerNoContext.setTagAnalyzer(analyzer);
      (workerNoContext as any).llmService = llm;

      const id1 = await engine.insert({
        content: 'Section 1',
        summary: 'S1',
        type: 'CONTEXT',
        tier: 'WORKING',
        source: '/doc.md',
        tags: '',
      });
      engine.updateStructuredMap(id1, JSON.stringify({ summary: 'Section 1 summary' }));

      const id2 = await engine.insert({
        content: 'Section 2',
        summary: 'S2',
        type: 'CONTEXT',
        tier: 'WORKING',
        source: '/doc.md',
        tags: '',
      });

      const repo = new PendingTaskRepository(adapter);
      const taskId = await repo.create({
        task_type: TaskType.TAG_ENRICHMENT,
        entry_id: id2,
        payload: { entry_id: id2, content: 'Section 2', existing_tags: '', source: '/doc.md' },
      });
      const task = await repo.findById(taskId);
      const payload = JSON.parse(task!.payload);

      // Capture context pass to analyzer
      const analyzeSpy = vi.spyOn(analyzer, 'analyzeTags');
      await (workerNoContext as any).processTagEnrichment(task!, payload);

      // With context disabled, context param should be null
      expect(analyzeSpy).toHaveBeenCalledWith(payload.content, payload.options, null);

      const entry2 = await engine.findById(id2);
      const sm2 = JSON.parse(entry2!.structured_map);
      expect(sm2.context_chain).toBeUndefined();
    });
  });

  // IT-06: Context chain — Previous section LLM failed
  describe('IT-06: Previous section fallback', () => {
    it('returns null context when previous section has no summary', async () => {
      const id1 = await engine.insert({
        content: 'Failed section',
        summary: 'FS',
        type: 'CONTEXT',
        tier: 'WORKING',
        source: '/doc.md',
        tags: 'error',
      });
      engine.updateStructuredMap(id1, JSON.stringify({
        tags: ['error-pattern'],
        extraction_meta: { fallback_used: true },
      }));

      const id2 = await engine.insert({
        content: 'Next section',
        summary: 'NS',
        type: 'CONTEXT',
        tier: 'WORKING',
        source: '/doc.md',
        tags: '',
      });

      // Use the real DB — loadPreviousContext queries by source
      const context = await (worker as any).loadPreviousContext(id2, '/doc.md');
      expect(context).toBeNull();
    });
  });
});
