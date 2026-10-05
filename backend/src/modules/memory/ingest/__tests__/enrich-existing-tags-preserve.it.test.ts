/**
 * SA4E-337 R1 (TA re-review, MEDIUM) — TAG_ENRICHMENT payloads created by the
 * admin `re_enrich` action and the on-demand enrich route MUST carry the entry's
 * current `tags` as `existing_tags`.
 *
 * Bug: both creators hardcoded `existing_tags: ''` AND their SELECT did not read
 * the `tags` column. With the LLM UP, TaskWorker.processTagEnrichment() unions
 * payload.existing_tags with result.appliedTags and then runs
 * `UPDATE knowledge_entries SET tags = ?` → merged === appliedTags only → wipes
 * the path tags (e.g. `sa4e,sa4e-337`) persisted at insert time (F1).
 * The LLM-DOWN branch looked safe because extractFallbackTags() re-derives the
 * path tags from payload.source — hence only the LLM-up path lost tags.
 *
 * Real chain on a temp SQLite DB (same approach as ingest-file-tags-fallback):
 * dispatcher/route → real SQL SELECT (now incl. `tags`) → real
 * PendingTaskRepository → REAL TaskWorker with a MOCK TagAnalyzer (LLM UP) →
 * knowledge_entries.tags asserted = MERGE with existing tags, never REPLACE.
 * Only the `getDbAdapter()` singleton *locator* of admin/db/core.js resolves to
 * the temp DB — every SQL statement still runs on real SQLite.
 *
 * STC trace: R1 (TA re-review) — FSD §3.5 / BR-22 (merge + dedup), F1 (insert tags).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import pino from 'pino';
import { makeTempDb, type TempDb } from '../../../../__tests__/sa4e-testkit.js';
import type { DatabaseAdapter } from '../../../../database/adapters/DatabaseAdapter.js';
import type { AdminContext } from '../../../../server/routes/admin/context.js';
import { createKbEntriesRoutes } from '../../../../server/routes/admin/kb-entries.js';
import { handleAdmin } from '../../dispatchers/analytics.js';
import { TaskWorker } from '../../task-queue/TaskWorker.js';
import { PendingTaskRepository } from '../../task-queue/PendingTaskRepository.js';
import type { TagAnalyzerService } from '../../llm/analyzer.js';

const logger = pino({ level: 'silent' });
const PATH_TAGS = 'sa4e,sa4e-337';
/** Long enough for re-enrich's LENGTH(content) > 50 candidate filter. */
const CONTENT = '# BRD — Document Indexer\n#### STORY 1\nAs an indexer I want tags preserved across re-enrichment and on-demand enrichment.';

/** pending_tasks comes from migration 003 in production — the temp schema lacks it. */
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

/** Migration 007 columns (re-enrich filter + worker race guard depend on them). */
const ENRICHMENT_DDL = [
  `ALTER TABLE knowledge_entries ADD COLUMN enrichment_status TEXT DEFAULT NULL`,
  `ALTER TABLE knowledge_entries ADD COLUMN enriched_by TEXT DEFAULT NULL`,
  `ALTER TABLE knowledge_entries ADD COLUMN enriched_at TEXT DEFAULT NULL`,
];

/** LLM-UP analyzer mock — shaped like a real TagAnalyzerService result. */
const llmUpAnalyzer = () => ({
  analyzeTags: async () => ({
    appliedTags: ['llm-doc'], suggestedTags: [], fallbackUsed: false,
    summary: 'LLM summary produced by the live LLM path',
    business_entities: [], actors: [], business_rules: [],
  }),
}) as unknown as TagAnalyzerService;

let ctx: TempDb;
let adapter: DatabaseAdapter;
// The admin enrich route resolves its DB through this singleton locator — point
// it at the temp DB. Everything else (SQL, repository, worker) is production code.
let tempAdapter: DatabaseAdapter | null = null;
vi.mock('../../../../admin/db/core.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../admin/db/core.js')>();
  return { ...actual, getDbAdapter: () => tempAdapter ?? actual.getDbAdapter() };
});

/** Minimal AdminContext — the kb-entry enrich branch only needs auth/project. */
function stubCtx(): AdminContext {
  return {
    logger, kbTags: {}, kbLinks: {}, db: {} as never,
    requireAuth: async () => ({ userId: 'user-1' }),
    requirePermission: async () => ({ roleData: {} }),
    getRequestProjectId: () => '22b039993db3',
  } as unknown as AdminContext;
}

async function seedEntry(source: string, tags: string, status: string, summary: string): Promise<number> {
  const id = await ctx.engine.insert({ content: CONTENT, summary, type: 'CONTEXT', tier: 'SHARED', source, tags });
  await adapter.runAsync(`UPDATE knowledge_entries SET enrichment_status = ? WHERE id = ?`, [status, id]);
  return id;
}

async function tagsOf(entryId: number): Promise<string[]> {
  const rows = await adapter.allAsync<{ tags: string }>(`SELECT tags FROM knowledge_entries WHERE id = ?`, [entryId]);
  return String(rows[0]?.tags ?? '').split(',').map(t => t.trim()).filter(Boolean);
}

async function queuedPayload(entryId: number): Promise<any> {
  const rows = await adapter.allAsync<{ payload: string }>(
    `SELECT payload FROM pending_tasks WHERE entry_id = ? AND task_type = 'TAG_ENRICHMENT'`, [entryId]);
  expect(rows.length).toBe(1);
  return JSON.parse(rows[0].payload);
}

/** Run the queued task through the REAL worker's LLM-up branch. Returns final tags. */
async function enrichWithMockLlm(entryId: number): Promise<string[]> {
  const worker = new TaskWorker(adapter, ctx.engine, logger);
  worker.setTagAnalyzer(llmUpAnalyzer());
  const task = await new PendingTaskRepository(adapter).claimNext();
  expect(task).not.toBeNull();
  await (worker as any).processTagEnrichment(task!, JSON.parse(task!.payload));
  return tagsOf(entryId);
}

beforeEach(async () => {
  ctx = await makeTempDb();
  adapter = ctx.dbManager.getAdapter();
  tempAdapter = adapter;
  await adapter.runAsync(PENDING_TASKS_DDL, []);
  for (const ddl of ENRICHMENT_DDL) { try { await adapter.runAsync(ddl, []); } catch { /* already applied */ } }
});

afterEach(async () => {
  tempAdapter = null;
  await ctx.close();
});

describe('SA4E-337 R1: TAG_ENRICHMENT payload creators pass existing_tags', () => {
  // R1 fix #2 — admin `re_enrich` dispatcher (analytics.ts)
  it('re_enrich queues current tags and the LLM-up merge keeps them (not replace)', async () => {
    const id = await seedEntry('documents/SA4E-337/BRD.md', PATH_TAGS, 'done', "1. What's New");
    expect(await tagsOf(id)).toEqual(['sa4e', 'sa4e-337']); // baseline from insert (F1)

    const out = await handleAdmin(ctx.engine, { action: 're_enrich', limit: 10 });
    expect(JSON.parse(out)).toMatchObject({ status: 'queued', queued: 1 });

    const payload = await queuedPayload(id);
    expect(payload.existing_tags).toBe(PATH_TAGS); // R1 — was ''
    expect(payload.source).toBe('documents/SA4E-337/BRD.md'); // F1

    const tags = await enrichWithMockLlm(id);
    expect(tags).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337'])); // NOT wiped
    expect(tags).toEqual(expect.arrayContaining(['llm-doc'])); // LLM tag merged in
    expect(tags).toHaveLength(3);
    expect(new Set(tags).size).toBe(tags.length); // BR-22 dedup
  });

  // R1 fix #1 — on-demand enrich route (server/routes/admin/kb-entries.ts)
  it('on-demand enrich route selects `tags` and passes them as existing_tags', async () => {
    const id = await seedEntry('documents/SA4E-337/FSD.md', PATH_TAGS, 'pending', 'FSD — feature spec');
    const app = new Hono();
    app.route('/', createKbEntriesRoutes(stubCtx()));

    const res = await app.request(`/api/admin/kb/entries/kb-entry:${id}/enrich`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).status).toBe('queued');

    const payload = await queuedPayload(id);
    expect(payload.existing_tags).toBe(PATH_TAGS); // R1 — was ''
    expect(payload.source).toBe('documents/SA4E-337/FSD.md'); // F1

    const tags = await enrichWithMockLlm(id);
    expect(tags).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337', 'llm-doc']));
    expect(tags).toHaveLength(3);
  });
});
