/**
 * SA4E-420 — core tools tests: session pinning, hybrid search, skeleton-only,
 * 120-line enforcement, graph directions, DSL format, schema token budget.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SnapshotRetrievalService } from '../../retrieval/snapshot-retrieval.js';
import { CoreAgentTools, MAX_READ_LINES } from '../core-tools.js';
import { CORE_TOOL_SCHEMAS } from '../../security/tool-schemas.js';
import { estimateTokens } from '../tool-context.js';
import { makeRetrievalDb, P } from '../../retrieval/__tests__/retrieval-fixtures.js';

const PIN = { repository_id: 'r1', commit_id: 'c1', index_snapshot_id: 'S1' };

function stubEmbed(text: string): Buffer {
  const h = createHash('sha256').update(text).digest();
  return Buffer.from(new Float32Array([h[0] / 255, h[1] / 255, h[2] / 255, h[3] / 255]).buffer);
}

const SOURCE = ['const a = 1;', 'const b = 2;', 'const c = 3;'].join('\n');

describe('SA4E-420 core agent tools', () => {
  let adapter: SqliteAdapter;
  let tools: CoreAgentTools;

  beforeEach(async () => {
    adapter = await makeRetrievalDb();
    // extra body content for read_code_block on src/auth.ts
    adapter.exec(`UPDATE source_file_revision SET line_count = 3 WHERE id = 'f1'`);
    const retrieval = new SnapshotRetrievalService(adapter as any);
    tools = new CoreAgentTools(
      adapter as any,
      retrieval,
      stubEmbed,
      async (fp) => (fp === 'src/auth.ts' ? SOURCE : ''),
    );
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('all 4 tools enforce the session pin (FAILED snapshot + commit mismatch)', async () => {
    const badStatus = { repository_id: 'r1', commit_id: 'c1', index_snapshot_id: 'S3' };
    const badCommit = { repository_id: 'r1', commit_id: 'OTHER', index_snapshot_id: 'S1' };
    await expect(tools.searchSymbols(badStatus, { query: 'x' })).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(tools.searchSymbols(badCommit, { query: 'x' })).rejects.toThrow(/PIN_COMMIT_MISMATCH/);
    await expect(tools.getFileSkeleton(badStatus, 'src/auth.ts')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(tools.readCodeBlock(badStatus, 'src/auth.ts', 1, 2)).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(tools.queryCallGraph(badStatus, 'symLogin', 'CALLEES')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
  });

  it('search_symbols: hybrid DSL format + metadata + cursor', async () => {
    const result = await tools.searchSymbols(PIN, { query: 'authorization', limit: 10 });
    expect(result.dsl).toMatch(/\[FOUND \d+ SYMBOLS \| BUDGET_USED: \d+ tokens\]/);
    expect(result.dsl).toContain('# [');
    expect(result.dsl).toContain('Sig:');
    expect(result.resultId).toBeTruthy();
    expect(result.evidenceIds.length).toBeGreaterThan(0);
    // scoping: only S1 chunks
    for (const e of result.data) {
      const owner = adapter.get<{ snapshot_id: string }>(`SELECT snapshot_id FROM code_chunk WHERE id = ?`, [e.chunkId]);
      expect(owner?.snapshot_id).toBe('S1');
    }
  });

  it('search_symbols: kind + path_filter narrow results; cursor paginates', async () => {
    const kind = await tools.searchSymbols(PIN, { query: 'helper', kind: 'class' });
    for (const e of kind.data) expect(e.kind.toLowerCase()).toBe('class');
    const page1 = await tools.searchSymbols(PIN, { query: 'authorization', limit: 1 });
    if (page1.truncated) {
      expect(page1.nextPageCursor).toMatch(/offset:1/);
      const offset = 1;
      const page2 = await tools.searchSymbols(PIN, { query: 'authorization', limit: 1 }, offset);
      expect(page2.data[0].chunkId).not.toBe(page1.data[0].chunkId);
    } else {
      expect(page1.nextPageCursor).toBeUndefined();
    }
  });

  it('get_file_skeleton: signatures only, no bodies (AC)', async () => {
    const result = await tools.getFileSkeleton(PIN, 'src/auth.ts');
    expect(result.dsl).toMatch(/\[FOUND \d+ SKELETON LINES/);
    expect(result.dsl).toContain('# [CLASS] AuthService | src/auth.ts:1-40');
    expect(result.dsl).not.toContain('validator.validate'); // no bodies
    expect(result.data.every((d) => d.endLine >= d.startLine)).toBe(true);
  });

  it('read_code_block: enforces 120 lines max (AC) + cursor', async () => {
    const result = await tools.readCodeBlock(PIN, 'src/auth.ts', 1, 3);
    expect(result.dsl).toMatch(/\[CODE BLOCK src\/auth\.ts:1-3 \| LINES: 3\]/);
    expect(result.data.content).toContain('const b = 2;');
    expect(result.truncated).toBe(false);
    const tooBig = { repository_id: 'r1', commit_id: 'c1', index_snapshot_id: 'S1' };
    await expect(tools.readCodeBlock(tooBig, 'src/auth.ts', 1, 200)).rejects.toThrow(/LINE_RANGE_EXCEEDED/);
    expect(MAX_READ_LINES).toBe(120);
  });

  it('query_call_graph: CALLERS/CALLEES/IMPLEMENTATIONS directions (AC)', async () => {
    const callees = await tools.queryCallGraph(PIN, 'symLogin', 'CALLEES');
    expect(callees.data.map((n) => n.id)).toContain('symUtil');
    const callers = await tools.queryCallGraph(PIN, 'symUtil', 'CALLERS');
    expect(callers.data.map((n) => n.id)).toContain('symLogin');
    // direct vs inferred evidence travels
    const rel = callees.data.find((n) => n.id === 'symUtil');
    expect(['direct', 'inferred']).toContain(rel?.evidence);
    // IMPLEMENTATIONS: no INHERITS edges in fixture → empty DSL
    const impl = await tools.queryCallGraph(PIN, 'symUtil', 'IMPLEMENTATIONS');
    expect(impl.dsl).toMatch(/\[FOUND 0 IMPLEMENTATIONS NODES/);
  });

  it('tool schemas total ~450 tokens (AC)', () => {
    const json = JSON.stringify(CORE_TOOL_SCHEMAS);
    const tokens = estimateTokens(json);
    expect(tokens).toBeLessThanOrEqual(450);
    expect(Object.keys(CORE_TOOL_SCHEMAS)).toHaveLength(4);
  });
});
