/**
 * E2E-API-01 to E2E-API-05: Full pipeline E2E tests
 * Tests file ingest → entry creation → content verification.
 *
 * NOTE: These tests bypass the Hono HTTP layer and call handleIngestFile
 * directly (same pattern as ingest-flow.it.test.ts). Full HTTP-level E2E
 * tests with TaskWorker + structured_map require a Hono test server and
 * pending_tasks migration setup not yet available in this test context.
 * The TaskWorker → structured_map flow is covered by IT-01 to IT-08.
 *
 * TODO: Add TaskWorker processing when pending_tasks migration is
 * integrated into makeTempDb() or when a dedicated E2E test DB setup
 * is created.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleIngestFile } from '../../dispatchers/crud.js';
import { makeTempDb, type TempDb } from '../../../../__tests__/sa4e-testkit.js';

/** Query entries directly from DB (avoids FTS search which may not index immediately). */
function getEntriesBySource(ctx: TempDb, sourceSuffix: string): any[] {
  const db = ctx.dbManager.getDb();
  const stmt = db.prepare('SELECT * FROM knowledge_entries WHERE source LIKE ? ORDER BY id');
  return stmt.all(`%${sourceSuffix}`);
}

describe('E2E-API: File Ingest → Entry Creation', () => {
  let ctx: TempDb;
  let tmpDir: string;

  beforeEach(() => {
    ctx = makeTempDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e47-e2e-'));
  });

  afterEach(() => {
    ctx.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // E2E-API-01: Full cycle — 3-section file → entries created
  it('E2E-API-01: ingests 3-section file and creates entries', async () => {
    const mdFile = path.join(tmpDir, 'test.md');
    const lines = [
      '# Section 1: Authentication',
      '',
      'Content about authentication flow with JWT tokens and user login.',
      '',
      '## Section 2: Authorization',
      '',
      'Content about authorization rules and role-based access control.',
      '',
      '### Section 3: Session Management',
      '',
      'Content about session handling and token refresh.',
      '',
    ];
    fs.writeFileSync(mdFile, lines.join('\n'));

    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: mdFile });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBe(3);

    // Verify entries exist with structured_map default
    const matched = getEntriesBySource(ctx, 'test.md');
    expect(matched.length).toBe(3);

    for (const entry of matched) {
      expect(entry.structured_map).toBe('{}');
      expect(entry.source).toContain('test.md');
    }
  });

  // E2E-API-02: Context chain flows through entry creation
  it('E2E-API-02: ingest creates entries with correct source and defaults', async () => {
    const mdFile = path.join(tmpDir, 'test.md');
    fs.writeFileSync(mdFile, '# Section 1\n\nContent 1\n\n## Section 2\n\nContent 2\n');

    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: mdFile });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBe(2);

    const matched = getEntriesBySource(ctx, 'test.md');
    expect(matched.length).toBe(2);

    // Each entry has default structured_map = '{}'
    for (const entry of matched) {
      expect(entry.structured_map).toBe('{}');
    }
  });

  // E2E-API-04: Ingest with LLM-unavailable scenario
  it('E2E-API-04: ingest still succeeds even if LLM is unavailable later', async () => {
    // Ingest should always succeed; LLM processing happens async in TaskWorker
    const mdFile = path.join(tmpDir, 'test.md');
    fs.writeFileSync(mdFile, '# Section 1\n\nError: bug fix for login decision.\n');

    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: mdFile });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBe(1);

    // Entry created with default structured_map
    const matched = getEntriesBySource(ctx, 'test.md');
    expect(matched.length).toBe(1);
    expect(matched[0].structured_map).toBe('{}');
  });

  // E2E-API-05: File with no headings — single section
  it('E2E-API-05: plain text file (no headings) ingests as single entry with full content', async () => {
    const txtFile = path.join(tmpDir, 'plain.txt');
    const fullContent = 'A'.repeat(5000);
    fs.writeFileSync(txtFile, fullContent);

    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: txtFile });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBe(1);

    // Verify entries by querying DB directly
    const matched = getEntriesBySource(ctx, 'plain.txt');
    expect(matched.length).toBe(1);
    expect(matched[0].structured_map).toBe('{}');
    // Content should be full 5000 chars (not truncated at 2000)
    expect(matched[0].content?.length).toBe(5000);
  });
});
