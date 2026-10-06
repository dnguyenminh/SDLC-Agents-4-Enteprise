/**
 * STC UT-79 / UT-80 / UT-82 — fallbackTagExtraction (SA4E-337 Fix #5, Bug #5).
 *
 * The worker is constructed WITHOUT a TagAnalyzer, which is exactly the LLM-down
 * branch: processTagEnrichment() → fallbackTagExtraction() (TaskWorker.ts).
 * Real in-memory SQLite is used so the SQL race guard (F4) is exercised for real.
 *
 * Testdata reference: documents/SA4E-337/testdata/fallback-tag-testdata.csv and
 * documents/SA4E-337/STC.md §5.
 *
 * Spec reconciliation (documented deviation, see report to SM):
 * - FSD TC-11 + STC UT-82 say a ROOT-LEVEL file (no folder) falls back to
 *   `documents`; fallback-tag-testdata row `root.md → [unknown]` says BR-24.
 *   Resolution: root-level file → `documents`; `unknown` is used when NOTHING is
 *   derivable (BR-24 "fallback fails" = empty/missing source + no content tags).
 * - FSD TC-13 "collect-all deep folders" vs BR-20 "MUST use immediate parent":
 *   BR-20 (business rule) wins — only the nearest non-denylisted folder is added.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../SqliteDbAdapter.js';
import { MemoryEngine } from '../../engine/index.js';
import { MEMORY_SCHEMA } from '../../schema/index.js';
import { PendingTaskRepository } from '../PendingTaskRepository.js';
import { TaskType } from '../models.js';
import { TaskWorker, extractFallbackTags } from '../TaskWorker.js';
import { extractTagsFromPath } from '../../../../server/routes/api-index-ingest.js';
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
`;

/** Run one TAG_ENRICHMENT task through the no-LLM fallback branch. */
async function runFallback(
  db: SqliteAdapter,
  engine: MemoryEngine,
  entryId: number,
  payload: Record<string, unknown>,
): Promise<{ tags: string; enrichment_status: string | null; enriched_by: string | null; taskStatus: string }> {
  const adapter = new SqliteDbAdapter(db as any);
  const worker = new TaskWorker(adapter, engine, logger); // no setTagAnalyzer → fallback branch
  const repo = new PendingTaskRepository(adapter);
  const taskId = await repo.create({ task_type: TaskType.TAG_ENRICHMENT, entry_id: entryId, payload });
  const task = await repo.findById(taskId);
  await (worker as any).processTagEnrichment(task!, JSON.parse(task!.payload));

  const entry = await engine.findById(entryId);
  const row = db.get<{ enrichment_status: string | null; enriched_by: string | null }>(
    'SELECT enrichment_status, enriched_by FROM knowledge_entries WHERE id = ?', [entryId],
  );
  const taskRow = db.get<{ status: string }>('SELECT status FROM pending_tasks WHERE id = ?', [taskId]);
  return {
    tags: entry!.tags ?? '',
    enrichment_status: row?.enrichment_status ?? null,
    enriched_by: row?.enriched_by ?? null,
    taskStatus: taskRow?.status,
  };
}

describe('fallbackTagExtraction (STC UT-79..82 — LLM unavailable)', () => {
  let db: SqliteAdapter;
  let adapter: SqliteDbAdapter;
  let engine: MemoryEngine;

  beforeEach(async () => {
    db = new SqliteAdapter(':memory:');
    await db.connect();
    await db.exec(MEMORY_SCHEMA);
    await db.exec(PENDING_TASKS_SCHEMA);
    // Migration 007 columns (worker race guard F4 depends on them)
    await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending'`);
    await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_by TEXT DEFAULT NULL`);
    await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_at TEXT DEFAULT NULL`);
    adapter = new SqliteDbAdapter(db as any);
    engine = new MemoryEngine(adapter);
    engine.startSession('fallback-tag-test');
  });

  afterEach(async () => { await db.disconnect(); });

  // ── STC UT-79: parent path + content tags, task COMPLETED ──────────────
  describe('UT-79: fallback applies parent-path + content tags', () => {
    it('payload source …/SA4E-337/BRD.md + #### STORY → sa4e, sa4e-337, brd, user-story', () => {
      const tags = extractFallbackTags({
        source: 'documents/SA4E-337/BRD.md',
        content: '#### STORY 1\nAs a user I want to ingest documents',
        existing_tags: '',
      });
      expect(tags).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337', 'brd', 'user-story']));
      expect(tags).toHaveLength(new Set(tags).size); // no duplicates
    });

    it('CSV rows: immediate parent folder name is the fallback tag (BR-20)', () => {
      expect(extractFallbackTags({ source: 'dev/notes.md' })).toEqual(expect.arrayContaining(['dev']));
      expect(extractFallbackTags({ source: 'docs-old/report.md' })).toEqual(expect.arrayContaining(['docs-old']));
      expect(extractFallbackTags({ source: 'projects/x/y/file.md' })).toEqual(expect.arrayContaining(['y']));
      expect(extractFallbackTags({ source: 'archive/2024/report.md' })).toEqual(expect.arrayContaining(['2024']));
    });

    it('end-to-end: DB row is tagged, task COMPLETED, enrichment closed (F4)', async () => {
      const id = await engine.insert({
        content: '#### STORY 1\nDocument ingest requirement', summary: 'BRD', type: 'REQUIREMENT',
        tier: 'SHARED', source: 'documents/SA4E-337/BRD.md', tags: '',
      });
      const result = await runFallback(db, engine, id, {
        entry_id: id,
        content: '#### STORY 1\nDocument ingest requirement',
        existing_tags: '',
        source: 'documents/SA4E-337/BRD.md',
      });

      expect(result.tags.split(',')).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337', 'brd', 'user-story']));
      expect(result.taskStatus).toBe('COMPLETED');
      // F4: entry must NOT stay 'pending' when the LLM is down
      expect(result.enrichment_status).toBe('done');
      expect(result.enriched_by).toBe('fallback');
    });
  });

  // ── STC UT-80: dedup + denylist ────────────────────────────────────────
  describe('UT-80: deduplication + denylist skip (BR-22/BR-23)', () => {
    it('existing sa4e-337 + path SA4E-337 → single tag; denylisted diagrams folder unused', async () => {
      const id = await engine.insert({
        content: 'diagrams and tags', summary: 'Diagrams', type: 'CONTEXT',
        tier: 'WORKING', source: 'documents/SA4E-337/diagrams/arch.png', tags: '',
      });
      const result = await runFallback(db, engine, id, {
        entry_id: id,
        content: 'diagrams and tags',
        existing_tags: 'sa4e-337',
        source: 'documents/SA4E-337/diagrams/arch.png',
      });

      const tags = result.tags.split(',').map((t) => t.trim()).filter(Boolean);
      expect(tags.filter((t) => t.toLowerCase() === 'sa4e-337')).toHaveLength(1); // BR-22
      expect(tags).not.toContain('diagrams'); // BR-23 — denylisted parent skipped (TC-16)
      expect(tags).toEqual(expect.arrayContaining(['sa4e']));
      expect(result.taskStatus).toBe('COMPLETED');
    });

    it('denylisted parent falls through to the nearest non-denylisted ancestor (FSD EF-2)', () => {
      const tags = extractFallbackTags({ source: 'documents/SA4E-337/templates/tpl.md' });
      expect(tags).not.toContain('templates');
      expect(tags).toEqual(expect.arrayContaining(['sa4e-337']));
    });

    it('parent folder equal to the file name stem is added once (CSV backup/backup.md)', () => {
      const tags = extractFallbackTags({ source: 'backup/backup.md' });
      expect(tags).toEqual(['backup']);
    });
  });

  // ── STC UT-82: nested secondary tag + root fallback + never empty ──────
  describe('UT-82: nested secondary tag + root-level fallback + never empty', () => {
    it('nested ticket folder: primary ticket tag + secondary attachments tag', () => {
      // Primary half comes from the ingest route (extractTagsFromPath)…
      const primary = extractTagsFromPath('SA4E-337/attachments/spec.pdf');
      expect(primary).toEqual(expect.arrayContaining(['sa4e-337']));
      // …secondary half from the fallback (FSD §5 Fix #5) — Story 5 AC-2
      const tags = extractFallbackTags({ source: 'documents/SA4E-337/attachments/scan.pdf' });
      expect(tags).toEqual(expect.arrayContaining(['sa4e-337', 'attachments']));
    });

    it('root-level file falls back to `documents` (FSD TC-11 / Story 5 AC-3)', () => {
      expect(extractFallbackTags({ source: 'overview.md' })).toEqual(['documents']);
      expect(extractFallbackTags({ source: 'documents/overview.md' })).toEqual(['documents']);
      expect(extractFallbackTags({ source: 'documents/x.md' })).toEqual(['documents']);
    });

    it('non-ticket path falls back to the parent folder tag (BR-20)', () => {
      expect(extractFallbackTags({ source: 'attachments/spec.pdf' })).toEqual(['attachments']);
    });

    it('never empty — empty source/content degrades to `unknown` (BR-08/BR-11/BR-24)', () => {
      expect(extractFallbackTags({ source: '', content: '' })).toEqual(['unknown']);
      expect(extractFallbackTags({})).toEqual(['unknown']);
      expect(extractFallbackTags({ source: 'diagrams/x.md', content: '' })).toEqual(['unknown']);
      // Content heuristics alone still produce a non-empty result
      expect(extractFallbackTags({ source: '', content: '## Architecture' }))
        .toEqual(expect.arrayContaining(['architecture']));
    });
  });
});

// ── SA4E-337 F4 — race guard on the fallback UPDATE ───────────────────────
describe('fallbackTagExtraction F4: race guard + enrichment_status close', () => {
  let db: SqliteAdapter;
  let adapter: SqliteDbAdapter;
  let engine: MemoryEngine;

  beforeEach(async () => {
    db = new SqliteAdapter(':memory:');
    await db.connect();
    await db.exec(MEMORY_SCHEMA);
    await db.exec(PENDING_TASKS_SCHEMA);
    await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending'`);
    await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_by TEXT DEFAULT NULL`);
    await db.exec(`ALTER TABLE knowledge_entries ADD COLUMN enriched_at TEXT DEFAULT NULL`);
    adapter = new SqliteDbAdapter(db as any);
    engine = new MemoryEngine(adapter);
    engine.startSession('fallback-f4-test');
  });

  afterEach(async () => { await db.disconnect(); });

  it('does NOT overwrite tags of an entry already enriched by the client (status=done)', async () => {
    const id = await engine.insert({
      content: 'client enriched content', summary: 'Client', type: 'CONTEXT',
      tier: 'WORKING', source: 'documents/SA4E-337/FSD.md', tags: 'client-tag',
    });
    // Simulate the client winning the race (enrich.ts sets status=done, enriched_by=client_llm)
    await db.run('UPDATE knowledge_entries SET enrichment_status = ? WHERE id = ?', ['done', id]);

    const result = await runFallback(db, engine, id, {
      entry_id: id,
      content: 'client enriched content',
      existing_tags: 'client-tag',
      source: 'documents/SA4E-337/FSD.md',
    });

    expect(result.tags).toBe('client-tag'); // untouched — race guard held
    expect(result.enriched_by).toBeNull();
    expect(result.taskStatus).toBe('COMPLETED'); // task still completes
  });

  it('pending entry gets tags written AND is closed to done/fallback (no stuck pending)', async () => {
    const id = await engine.insert({
      content: '## Architecture\nsystem design', summary: 'TDD', type: 'ARCHITECTURE',
      tier: 'SHARED', source: 'documents/SA4E-337/TDD.md', tags: '',
    });
    await db.run('UPDATE knowledge_entries SET enrichment_status = ? WHERE id = ?', ['pending', id]);

    const result = await runFallback(db, engine, id, {
      entry_id: id,
      content: '## Architecture\nsystem design',
      existing_tags: '',
      source: 'documents/SA4E-337/TDD.md',
    });

    expect(result.tags.split(',')).toEqual(expect.arrayContaining(['sa4e-337', 'tdd', 'architecture']));
    expect(result.enrichment_status).toBe('done');
    expect(result.enriched_by).toBe('fallback');
    expect(result.taskStatus).toBe('COMPLETED');
  });
});
