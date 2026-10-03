/**
 * Regression (D3) — mem_ingest_file must store ONE row per file holding the
 * FULL document content (SA4E-163: UNIQUE(source, project_id) + UPSERT),
 * instead of collapsing N section chunks onto the same source key while
 * reporting `entries: N`.
 *
 * Covers both context paths:
 * - with projectId (production path via X-Project-Id)
 * - without scopeCtx (project_id NULL path)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleIngestFile } from '../../dispatchers/crud.js';
import { makeTempDb, type TempDb } from '../../../../__tests__/sa4e-testkit.js';

const MULTI_SECTION_MD = [
  '# Overview',
  '',
  'Overview body with token ALPHA-ONE.',
  '',
  '## Details',
  '',
  'Details body with token BETA-TWO.',
  '',
  '### Appendix',
  '',
  'Appendix body with token GAMMA-THREE.',
  '',
].join('\n');

async function rowsForSource(ctx: TempDb, source: string): Promise<any[]> {
  return ctx.dbManager.getAdapter().allAsync(
    'SELECT * FROM knowledge_entries WHERE source = ?',
    [source],
  );
}

describe('handleIngestFile — single full-content row per file (SA4E-163)', () => {
  let ctx: TempDb;
  let tmpDir: string;
  let mdFile: string;

  beforeEach(async () => {
    ctx = await makeTempDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-single-'));
    mdFile = path.join(tmpDir, 'doc.md');
    fs.writeFileSync(mdFile, MULTI_SECTION_MD);
  });

  afterEach(async () => {
    await ctx.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores exactly 1 row whose content spans >= 2 sections (with projectId)', async () => {
    const scopeCtx = { userId: 'user-1', projectId: '22b039993db3' };
    const result = await handleIngestFile(ctx.engine, scopeCtx, tmpDir, { file_path: mdFile });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBe(1);

    const rows = await rowsForSource(ctx, mdFile);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain('ALPHA-ONE');
    expect(rows[0].content).toContain('BETA-TWO');
    expect(rows[0].content).toContain('GAMMA-THREE');
    expect(rows[0].project_id).toBe('22b039993db3');
    expect(rows[0].summary).toContain('Overview');
  });

  it('stores exactly 1 row without scopeCtx (project_id NULL path)', async () => {
    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: mdFile });
    const parsed = JSON.parse(result);
    expect(parsed.entries).toBe(1);

    const rows = await rowsForSource(ctx, mdFile);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain('ALPHA-ONE');
    expect(rows[0].content).toContain('GAMMA-THREE');
  });

  it('re-ingesting the same file replaces the row instead of duplicating', async () => {
    const scopeCtx = { userId: 'user-1', projectId: '22b039993db3' };
    await handleIngestFile(ctx.engine, scopeCtx, tmpDir, { file_path: mdFile });

    const updated = `${MULTI_SECTION_MD}\n## Revision\n\nNew token DELTA-FOUR.\n`;
    fs.writeFileSync(mdFile, updated);
    const second = await handleIngestFile(ctx.engine, scopeCtx, tmpDir, { file_path: mdFile });
    expect(JSON.parse(second).entries).toBe(1);

    const rows = await rowsForSource(ctx, mdFile);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain('DELTA-FOUR');
  });

  it('re-ingest succeeds when the file has pending enrichment tasks — child-first cleanup (D3 follow-up)', async () => {
    // Live DB shape: pending_tasks created by migration 003 WITHOUT
    // ON DELETE CASCADE (verified via PRAGMA foreign_key_list → on_delete=NO ACTION).
    // Pre-fix, re-ingest failed with SQLITE_CONSTRAINT_FOREIGNKEY because
    // handleIngestFile deletes the old knowledge_entries row while its
    // enrichment tasks still reference it.
    const db = ctx.dbManager.getDb() as any;
    db.prepare(`CREATE TABLE IF NOT EXISTS pending_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      payload TEXT NOT NULL,
      max_retries INTEGER NOT NULL DEFAULT 3,
      project_id TEXT DEFAULT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id)
    )`).run();
    db.prepare(`PRAGMA foreign_keys = ON`).run();

    const scopeCtx = { userId: 'user-1', projectId: '22b039993db3' };
    const adapter = ctx.dbManager.getAdapter();

    const first = await handleIngestFile(ctx.engine, scopeCtx, tmpDir, { file_path: mdFile }, undefined, adapter, false);
    expect(JSON.parse(first).entries).toBe(1);
    const rows1 = await rowsForSource(ctx, mdFile);
    expect(rows1).toHaveLength(1);
    const staleBefore = await adapter.allAsync('SELECT id FROM pending_tasks WHERE entry_id = ?', [rows1[0].id]);
    expect(staleBefore.length).toBeGreaterThan(0); // TAG task created for the first row

    // Pre-fix this threw: SQLITE_CONSTRAINT_FOREIGNKEY (pending_tasks NO ACTION)
    const second = await handleIngestFile(ctx.engine, scopeCtx, tmpDir, { file_path: mdFile }, undefined, adapter, false);
    expect(JSON.parse(second).entries).toBe(1);

    const rows2 = await rowsForSource(ctx, mdFile);
    expect(rows2).toHaveLength(1);
    expect(rows2[0].content).toContain('ALPHA-ONE');
    // Replaced row gets a fresh id (AUTOINCREMENT); stale task must be gone…
    expect(rows2[0].id).not.toBe(rows1[0].id);
    const oldTasks = await adapter.allAsync('SELECT id FROM pending_tasks WHERE entry_id = ?', [rows1[0].id]);
    expect(oldTasks).toHaveLength(0);
    // …and a fresh task must reference the current row.
    const newTasks = await adapter.allAsync('SELECT id FROM pending_tasks WHERE entry_id = ?', [rows2[0].id]);
    expect(newTasks.length).toBeGreaterThan(0);
  });
});
