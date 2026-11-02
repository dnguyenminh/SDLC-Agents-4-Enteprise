/**
 * SA4E-394 — TC-308: mem_ingest_file per-tool matrix on the REAL ingest
 * pipeline (real temp SQLite DB via sa4e-testkit — no middleware mocks).
 * Workspace/allowlist resolution is exercised through the real resolver
 * BEFORE any read/dedup (BR-02/05/07).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MultiWorktreePathResolver } from '../multi-worktree-path-resolver.js';
import { setSharedPathResolver, resetSharedPathResolver } from '../path-resolver-provider.js';
import { createWorktreeFixture, type MultiWorktreeFixture } from './multi-worktree-fixture.js';
import { WorkspaceAllowlist } from '../workspace-allowlist.js';
import { silentLogger, makeTempDb, type TempDb } from '../../__tests__/sa4e-testkit.js';
import { handleIngestFile } from '../../modules/memory/dispatchers/crud-ingest-file.js';

const ALLOWLIST_MSG = 'is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS';
const CONTAINMENT_MSG = 'is outside workspace root';

let fx: MultiWorktreeFixture;
let resolver: MultiWorktreePathResolver;

beforeAll(() => {
  fx = createWorktreeFixture();
  const allowlist = WorkspaceAllowlist.load(fx.main, fx.logger, {
    MCP_WORKSPACE_ROOTS: fx.allowlistEnv,
  } as NodeJS.ProcessEnv);
  resolver = new MultiWorktreePathResolver(allowlist, fx.main, fx.logger);
  setSharedPathResolver(resolver);
});

afterAll(() => {
  resetSharedPathResolver();
  fx.cleanup();
});

let ctx: TempDb;
beforeEach(async () => { ctx = await makeTempDb(); });
afterEach(async () => { await ctx.close(); });

function rowsForSource(source: string) {
  return ctx.dbManager.getAdapter().allAsync(
    'SELECT * FROM knowledge_entries WHERE source = ?', [source]);
}
async function rowCount(): Promise<number> {
  const r = await ctx.dbManager.getAdapter().allAsync('SELECT id FROM knowledge_entries', []);
  return r.length;
}

describe('TC-308 — mem_ingest_file (backend fallback path, real pipeline)', () => {
  it('S1 (AC1): relative file_path + base_dir ingests the file from worktree B', async () => {
    const out = await handleIngestFile(ctx.engine, undefined, fx.main, {
      file_path: 'documents/SA4E-394/BRD.md', base_dir: fx.wtB,
    }, undefined, undefined, false, resolver);
    expect(JSON.parse(out)).toMatchObject({ status: 'ingested' });
    const source = `${fx.wtB}\\documents\\SA4E-394\\BRD.md`;
    const rows = await rowsForSource(source);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain('# BRD wt-b');
  });

  it('S2 (AC2): unregistered base_dir → PATH_REJECTED..., nothing ingested (BR-23)', async () => {
    const out = await handleIngestFile(ctx.engine, undefined, fx.main, {
      file_path: 'documents/SA4E-394/BRD.md', base_dir: fx.wtUnreg,
    }, undefined, undefined, false, resolver);
    expect(out).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(out).toContain(ALLOWLIST_MSG);
    expect(await rowCount()).toBe(0);
  });

  it('S3 (AC3): base_dir omitted → legacy behavior (direct absolute file_path)', async () => {
    const out = await handleIngestFile(ctx.engine, undefined, fx.main, {
      file_path: path.join(fx.main, 'notes.txt'),
    });
    expect(JSON.parse(out)).toMatchObject({ status: 'ingested' });
    const rows = await rowsForSource(fx.main + path.sep + 'notes.txt');
    expect(rows).toHaveLength(1);
  });

  it('S4/S5 (AC4): absolute outside + ../ traversal rejected before ingest', async () => {
    const r1 = await handleIngestFile(ctx.engine, undefined, fx.main, {
      file_path: path.join(fx.outside, 'evil.txt'), base_dir: fx.wtB,
    }, undefined, undefined, false, resolver);
    expect(r1).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    const r2 = await handleIngestFile(ctx.engine, undefined, fx.main, {
      file_path: '../../../outside/x.md', base_dir: fx.wtB,
    }, undefined, undefined, false, resolver);
    expect(r2).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(r2).toContain(CONTAINMENT_MSG);
    expect(await rowCount()).toBe(0);
  });
});
