/**
 * SA4E-415 — per-path snapshot enforcement + evidence separation + categories.
 * AC: all retrieval paths enforce snapshot_id filter (unit test per path).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SnapshotRetrievalService } from '../snapshot-retrieval.js';
import { makeRetrievalDb, float32Buf, P } from './retrieval-fixtures.js';

describe('SA4E-415 SnapshotRetrievalService — pin enforcement per path', () => {
  let adapter: SqliteAdapter;
  let svc: SnapshotRetrievalService;
  beforeEach(async () => {
    adapter = await makeRetrievalDb();
    svc = new SnapshotRetrievalService(adapter as any);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('pinOrThrow: FAILED/unknown snapshot rejected; READY accepted', async () => {
    await expect(svc.pinOrThrow('S3')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(svc.pinOrThrow('nope')).rejects.toThrow(/SNAPSHOT_NOT_FOUND/);
    await expect(svc.pinOrThrow('S1')).resolves.toMatchObject({ id: 'S1', status: 'READY' });
  });

  it('resolveActiveSnapshot: ref → active snapshot; re-point switches; FAILED active rejected', async () => {
    await expect(svc.resolveActiveSnapshot('r1', 'refs/heads/main')).resolves.toMatchObject({ id: 'S1' });
    adapter.run(
      `UPDATE repository_ref_index_state SET active_code_index_snapshot_id = 'S2' WHERE repository_id = 'r1'`,
    );
    await expect(svc.resolveActiveSnapshot('r1', 'refs/heads/main')).resolves.toMatchObject({ id: 'S2' });
    adapter.run(
      `UPDATE repository_ref_index_state SET active_code_index_snapshot_id = 'S3' WHERE repository_id = 'r1'`,
    );
    await expect(svc.resolveActiveSnapshot('r1', 'refs/heads/main')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
  });

  it('symbolByName: pinned to S1 returns ONLY S1 rows (same name exists in S2)', async () => {
    const hits = await svc.symbolByName('S1', 'AuthService');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 'symAuth', rankSource: 'exact-definition' });
    const hitsS2 = await svc.symbolByName('S2', 'AuthService');
    expect(hitsS2.map((h) => h.id)).toEqual(['symAuth2']);
  });

  it('symbolByName ranks exact-definition > proven-reference > text-similarity', async () => {
    const hits = await svc.symbolByName('S1', 'login');
    expect(hits[0]).toMatchObject({ id: 'symLogin', rankSource: 'exact-definition' });
    // login resolves EXACT → symUtil: proven-reference tier
    expect(hits.find((h) => h.id === 'symUtil')?.rankSource).toBe('proven-reference');
  });

  it('lexicalSearch: MATCH hits both snapshots physically, pin returns only S1 chunk', async () => {
    const hits = await svc.lexicalSearch('S1', 'authorization', 10);
    expect(hits.map((h) => h.chunkId)).toEqual(['ch1']); // chS2 excluded by pin
  });

  it('vectorSearch: only embeddings of the pinned snapshot participate', async () => {
    const hits = await svc.vectorSearch('S1', 'local-minilm', '1.0', float32Buf([1, 0, 0, 0]), 10);
    expect(hits.map((h) => h.chunkId)).toEqual(['ch1']);
    expect(hits[0].similarity).toBeCloseTo(1.0, 5);
    const hitsS2 = await svc.vectorSearch('S2', 'local-minilm', '1.0', float32Buf([1, 0, 0, 0]), 10);
    expect(hitsS2.map((h) => h.chunkId)).toEqual(['chS2']);
    expect(hitsS2[0].similarity).toBeCloseTo(0.0, 5); // orthogonal
  });

  it('relationshipsOf separates direct (PROVEN) from inferred (heuristic)', async () => {
    const rels = await svc.relationshipsOf('S1', 'symLogin');
    // rel1 (from symLogin), rel2 (from symLogin), rel3 (to symLogin — reverse edge)
    const byId = Object.fromEntries(rels.map((r) => [r.id, r.evidence]));
    expect(byId.rel1).toBe('direct');    // PROVEN evidence
    expect(byId.rel2).toBe('inferred');  // HEURISTIC only
    expect(byId.rel3).toBe('inferred');  // no evidence row
    // stable ordering: kind, id
    expect(rels.map((r) => r.kind)).toEqual(['CALLS', 'CALLS', 'USES']);
  });

  it('discoverCategory: build/config/test are first-class, snapshot-scoped', async () => {
    const tests = await svc.discoverCategory('S1', 'test');
    expect(tests.map((h) => h.relativePath)).toEqual(['src/auth.test.ts']);
    const build = await svc.discoverCategory('S1', 'build');
    expect(build.map((h) => h.relativePath)).toEqual(['package.json']);
    const config = await svc.discoverCategory('S1', 'config');
    expect(config.map((h) => h.relativePath)).toContain('config/app.yml');
  });

  it('hybridSearch fuses lexical + vector (+ graph chunks) under the pin', async () => {
    const hits = await svc.hybridSearch('S1', {
      modelKey: 'local-minilm',
      modelVersion: '1.0',
      queryEmbedding: float32Buf([1, 0, 0, 0]),
      lexicalQuery: 'authorization',
      rootSymbolId: 'symLogin',
      limit: 10,
    });
    // ch1 hits on BOTH lexical and vector (+graph chunk of symLogin) → top fused
    expect(hits[0]?.chunkId).toBe('ch1');
    expect(hits[0]?.contributing.map((c) => c.source)).toContain('lexical');
    expect(hits[0]?.contributing.map((c) => c.source)).toContain('vector');
    // every fused chunk belongs to S1 (pin invariant)
    for (const h of hits) {
      const owner = adapter.get<{ snapshot_id: string }>(
        `SELECT snapshot_id FROM code_chunk WHERE id = ?`,
        [h.chunkId],
      );
      expect(owner?.snapshot_id).toBe('S1');
    }
  });

  it('all paths reject non-READY snapshots (unit per path)', async () => {
    await expect(svc.symbolByName('S3', 'x')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(svc.lexicalSearch('S3', 'x')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(svc.vectorSearch('S3', 'm', '1.0', float32Buf([0, 0, 0, 1]))).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(svc.relationshipsOf('S3', 'symLogin')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(svc.graphFrom('S3', 'symLogin')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(svc.discoverCategory('S3', 'test')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    await expect(svc.hybridSearch('S3', { modelKey: 'm', modelVersion: '1.0', queryEmbedding: float32Buf([0, 0, 0, 1]), lexicalQuery: 'x' })).rejects.toThrow(/SNAPSHOT_NOT_READY/);
  });
});
