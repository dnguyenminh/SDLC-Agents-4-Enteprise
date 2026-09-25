/**
 * IT-01 to IT-07: TaskWorker Integration Tests
 * Full pipeline integration with in-memory SQLite and mocked LLM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../SqliteDbAdapter.js';
import { MemoryEngine } from '../../engine/index.js';
import { MEMORY_SCHEMA } from '../../schema/index.js';
import { PendingTaskRepository } from '../PendingTaskRepository.js';
import { TaskType } from '../models.js';
import { TaskWorker } from '../TaskWorker.js';
import { TagAnalyzerService } from '../../llm/analyzer.js';
import { LLMService } from '../../llm/LLMService.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

const PENDING_TASKS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS pending_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,
    entry_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload TEXT NOT NULL,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    project_id TEXT DEFAULT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
  );
  CREATE INDEX IF NOT EXISTS idx_pending_tasks_status_created ON pending_tasks(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_pending_tasks_entry_id ON pending_tasks(entry_id);
`;

async function createTestDb(): Promise<SqliteAdapter> {
  const db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(MEMORY_SCHEMA);
  await db.exec(PENDING_TASKS_SCHEMA);
  // SA4E-79: Apply enrichment status columns (migration 007)
  // Default to 'pending' in test context so TaskWorker processes them
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending'`);
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_by TEXT DEFAULT NULL`);
  await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_at TEXT DEFAULT NULL`);
  return db;
}

const validFullResponse = JSON.stringify({
  tags: [{ tag: 'auth-flow-login', category: 'feature', confidence: 0.95, reason: 'auth flow' }],
  summary: 'Describes authentication flow.',
  business_entities: ['User', 'JWT Token'],
  actors: ['End User'],
  business_rules: ['JWT expires after 24h'],
});

const testConfig = {
  baseInterval: 100,
  maxInterval: 1000,
  enableContextChain: true,
  contextChainMaxLength: 500,
  llmChunkSize: 6000,
  llmChunkOverlap: 200,
  structuredMapMaxSize: 102400,
};

describe('TaskWorker Integration Tests', () => {
  let db: SqliteAdapter;
  let adapter: SqliteDbAdapter;
  let engine: MemoryEngine;
  let llm: LLMService;
  let analyzer: TagAnalyzerService;
  let worker: TaskWorker;

  beforeEach(async () => {
    db = await createTestDb();
    adapter = new SqliteDbAdapter(db as any);
    engine = new MemoryEngine(adapter);
    engine.startSession('test');
    llm = new LLMService({ provider: 'ollama', model: 'test-model', maxTokens: 2048 });
    vi.spyOn(llm, 'complete').mockResolvedValue({
      content: validFullResponse,
      model: 'test-model',
      provider: 'ollama',
    });
    analyzer = new TagAnalyzerService(llm);
    worker = new TaskWorker(adapter, engine, logger, testConfig);
    worker.setTagAnalyzer(analyzer);
    (worker as any).llmService = llm; // set LLM service reference
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
