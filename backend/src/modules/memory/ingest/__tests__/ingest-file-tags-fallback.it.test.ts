/**
 * SA4E-337 F1 (dev-review + TA-review, High) — tags must reach the DB end-to-end.
 *
 * Bug: handleIngestFile() inserted `tags=''` (ignoring a.tags) AND no TAG_ENRICHMENT
 * payload creator set `source`, so TaskWorker.fallbackTagExtraction() (LLM-down path)
 * read payload.source = undefined and its path-tag branch was dead.
 *
 * This IT test runs the REAL production chain on a temp SQLite DB:
 *   buildIngestFileArgs (route helper) → MemoryToolDispatcher.dispatch('mem_ingest_file')
 *   → handleIngestFile (real insert + pending task) → TaskWorker WITHOUT TagAnalyzer
 *   → fallbackTagExtraction → knowledge_entries.tags asserted.
 *
 * Mock-level tests cannot catch this bug — hence real adapter, real dispatcher, real worker.
 *
 * STC trace: E2E-API-12 / IT-07 (tag enrichment ≥1 tag), FSD §3.5.2 (fallback).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import pino from 'pino';
import { makeTempDb, type TempDb } from '../../../../__tests__/sa4e-testkit.js';
import { MemoryToolDispatcher } from '../../dispatchers/index.js';
import { buildIngestFileArgs } from '../../../../server/routes/api-index-ingest.js';
import { TaskWorker } from '../../task-queue/TaskWorker.js';
import { PendingTaskRepository } from '../../task-queue/PendingTaskRepository.js';
import type { ScopeContext } from '../../models.js';

const logger = pino({ level: 'silent' });

const BRD_CONTENT = [
  '# BRD — Document Indexer',
  '',
  '#### STORY 1',
  'As an indexer I want documents ingested into KB.',
  '',
  '## Acceptance Criteria',
  '- Tags persisted in knowledge_entries',
  '',
].join('\n');

/** pending_tasks is created by migration 003 in production — the temp schema lacks it. */
const PENDING_TASKS_DDL = `
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
  )
`;

async function ensureEnrichmentColumns(ctx: TempDb): Promise<void> {
  const adapter = ctx.dbManager.getAdapter();
  for (const ddl of [
    `ALTER TABLE knowledge_entries ADD COLUMN enrichment_status TEXT DEFAULT NULL`,
    `ALTER TABLE knowledge_entries ADD COLUMN enriched_by TEXT DEFAULT NULL`,
    `ALTER TABLE knowledge_entries ADD COLUMN enriched_at TEXT DEFAULT NULL`,
  ]) {
    try { await adapter.runAsync(ddl, []); } catch { /* already applied */ }
  }
}

describe('SA4E-337 F1: ingest-file tags reach knowledge_entries end-to-end (IT)', () => {
  let ctx: TempDb;
  let tmpDir: string;
  let dispatcher: MemoryToolDispatcher;
  const tenant = { userId: 'user-1', projectId: '22b039993db3' };
  const scopeCtx: ScopeContext = { userId: tenant.userId, projectId: tenant.projectId };

  beforeEach(async () => {
    ctx = await makeTempDb();
    await ctx.dbManager.getAdapter().runAsync(PENDING_TASKS_DDL, []);
    await ctx.dbManager.getAdapter().runAsync(`PRAGMA foreign_keys = ON`, []);
    await ensureEnrichmentColumns(ctx);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-tags-'));

    dispatcher = new MemoryToolDispatcher(ctx.engine, tmpDir);
    dispatcher.setScopeContext(scopeCtx);
    dispatcher.setDbAdapter(ctx.dbManager.getAdapter());
  });

  afterEach(async () => {
    await ctx.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function rowFor(filePath: string): Promise<any> {
    const rows = await ctx.dbManager.getAdapter().allAsync(
      'SELECT * FROM knowledge_entries WHERE source = ?', [filePath],
    );
    return (rows as any[])[0];
  }

  // STC: E2E-API-12 — path tags (sa4e, sa4e-337) must be present after ingest + enrichment
  it('ingest → fallback enrichment → tags contain sa4e + sa4e-337 (real dispatcher/adapter/worker)', async () => {
    const filePath = 'documents/SA4E-337/BRD.md';
    const args = buildIngestFileArgs(filePath, BRD_CONTENT, tenant);
    // sanity: the route helper derives the path tags the bug used to drop
    expect(String(args.tags)).toBe('sa4e,sa4e-337');

    const out = await dispatcher.dispatch('mem_ingest_file', args);
    expect(JSON.parse(out as string)).toMatchObject({ status: 'ingested', entries: 1 });

    // (1) F1a: tags written at INSERT time (was hardcoded '')
    const row = await rowFor(filePath);
    expect(row).toBeTruthy();
    expect(String(row.tags).split(',')).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337']));
    expect(row.enrichment_status).toBe('pending');

    // (2) F1b: TAG_ENRICHMENT payload carries source + existing_tags
    const tasks = await ctx.dbManager.getAdapter().allAsync<any>(
      `SELECT payload FROM pending_tasks WHERE entry_id = ? AND task_type = 'TAG_ENRICHMENT'`, [row.id],
    );
    expect(tasks.length).toBe(1);
    const payload = JSON.parse(tasks[0].payload);
    expect(payload.source).toBe(filePath);
    expect(String(payload.existing_tags).split(',')).toEqual(expect.arrayContaining(['sa4e-337']));

    // (3) run the REAL fallback worker (LLM unavailable) — payload.source must flow into tags
    const adapter = ctx.dbManager.getAdapter();
    const worker = new TaskWorker(adapter, ctx.engine, logger);
    const repo = new PendingTaskRepository(adapter);
    const task = await repo.claimNext();
    expect(task).not.toBeNull();
    await (worker as any).processTagEnrichment(task!, JSON.parse(task!.payload));

    const enriched = await rowFor(filePath);
    const tags = String(enriched.tags).split(',').map((t: string) => t.trim()).filter(Boolean);
    expect(tags).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337'])); // F1 — end-to-end
    expect(tags).toEqual(expect.arrayContaining(['brd', 'user-story'])); // content heuristics
    expect(new Set(tags).size).toBe(tags.length);
    expect(enriched.enrichment_status).toBe('done'); // F4 — not stuck in pending
    expect(enriched.enriched_by).toBe('fallback');
  });

  // Regression net: even when the caller supplies NO tags, payload.source alone
  // must produce path tags through the fallback (this is the dead branch from F1).
  it('fallback derives path tags purely from payload.source when caller sent no tags', async () => {
    const filePath = 'documents/SA4E-337/FSD.md';
    const args = buildIngestFileArgs(filePath, '# FSD\n\ncontent', tenant);
    args.tags = ''; // simulate a caller that does not compute tags

    const out = await dispatcher.dispatch('mem_ingest_file', args);
    expect(JSON.parse(out as string).status).toBe('ingested');
    expect(String((await rowFor(filePath)).tags)).toBe(''); // nothing at insert time

    const adapter = ctx.dbManager.getAdapter();
    const worker = new TaskWorker(adapter, ctx.engine, logger);
    const repo = new PendingTaskRepository(adapter);
    const task = await repo.claimNext();
    await (worker as any).processTagEnrichment(task!, JSON.parse(task!.payload));

    const enriched = await rowFor(filePath);
    expect(String(enriched.tags).split(',')).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337', 'fsd']));
    expect(enriched.enrichment_status).toBe('done');
  });

  // Re-ingest replaces tags/tasks cleanly (stale-task cleanup) and keeps F1 behaviour
  it('re-ingest after fallback refreshes tags and closes the new enrichment task', async () => {
    const filePath = 'documents/SA4E-337/TDD.md';
    const args = buildIngestFileArgs(filePath, '# TDD\n\n## Architecture\n\ndesign', tenant);

    await dispatcher.dispatch('mem_ingest_file', args);
    const adapter = ctx.dbManager.getAdapter();
    const worker = new TaskWorker(adapter, ctx.engine, logger);
    const repo = new PendingTaskRepository(adapter);
    const first = await repo.claimNext();
    await (worker as any).processTagEnrichment(first!, JSON.parse(first!.payload));
    expect(String((await rowFor(filePath)).tags)).toContain('sa4e-337');

    const again = await dispatcher.dispatch('mem_ingest_file', args);
    expect(JSON.parse(again as string).status).toBe('ingested');

    const row = await rowFor(filePath);
    expect(row.enrichment_status).toBe('pending'); // fresh row re-queued
    const second = await repo.claimNext();
    expect(second).not.toBeNull();
    await (worker as any).processTagEnrichment(second!, JSON.parse(second!.payload));

    const final = await rowFor(filePath);
    expect(String(final.tags).split(',')).toEqual(expect.arrayContaining(['sa4e-337', 'tdd']));
    expect(final.enrichment_status).toBe('done');
  });
});
