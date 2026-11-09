/**
 * SA4E-427 — Acceptance criteria 01–08: indexing, snapshots, rename/delete,
 * merge commits, ownership invariants and retrieval isolation (16K Doc §19).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SnapshotIndexPipeline } from '../../pipeline/index-pipeline.js';
import { SnapshotRetrievalService } from '../../retrieval/snapshot-retrieval.js';
import { AgentPersistenceService } from '../../agent/agent-persistence.js';
import { resolvePinnedContext } from '../../api/pinned-snapshot-guard.js';
import { vec, makeAcceptanceDb, P } from './ac-fixtures.js';

describe('SA4E-427 acceptance criteria 01–08', () => {
  let adapter: SqliteAdapter;
  let retrieval: SnapshotRetrievalService;

  beforeEach(async () => {
    adapter = await makeAcceptanceDb();
    retrieval = new SnapshotRetrievalService(adapter as any);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  function counts(snapshotId: string) {
    return {
      symbols: adapter.get<{ n: number }>(`SELECT COUNT(*) AS n FROM code_symbol WHERE snapshot_id = ?`, [snapshotId])?.n,
      chunks: adapter.get<{ n: number }>(`SELECT COUNT(*) AS n FROM code_chunk WHERE snapshot_id = ?`, [snapshotId])?.n,
    };
  }

  it('AC-01 re-index same commit with a new adapter → old snapshot intact', async () => {
    const before = counts('S1');
    const handlers: any = {
      D_SYNTAX_INDEX: {
        kind: 'single',
        handler: async () => {
          adapter.exec(`INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line)
            VALUES ('s-adapter2', '${P}', 'S6', 'f1', 'AuthService', 'class', 1, 21)`);
          adapter.exec(`INSERT INTO code_chunk (id, project_id, snapshot_id, symbol_id, sfr_id, chunk_index, start_line, end_line)
            VALUES ('ch6', '${P}', 'S6', 's-adapter2', 'f1', 0, 1, 21)`);
          return { status: 'OK' };
        },
      },
    };
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, {
      projectId: P, repositoryId: 'r1', commitId: 'c1', snapshotId: 'S6',
    }, ['typescript']).run();
    expect(result.snapshotStatus).toBe('READY');
    expect(counts('S1')).toEqual(before); // old snapshot untouched
    expect(adapter.get<any>(`SELECT status FROM code_index_snapshot WHERE id = 'S1'`)?.status).toBe('READY');
    expect(counts('S6')).toEqual({ symbols: 1, chunks: 1 }); // new adapter output
  });

  it('AC-02 two embedding models on the same snapshot → no vector mixing', async () => {
    const local = await retrieval.vectorSearch('S1', 'local-minilm', '1.0', vec(1, 0, 0, 0), 10);
    expect(local.map((h) => h.chunkId)).toEqual(['ch1', 'ch1b']); // es1 only
    const other = await retrieval.vectorSearch('S1', 'other-model', '1.0', vec(0, 1, 0, 0), 10);
    expect(other.map((h) => h.chunkId)).toEqual(['ch-other']); // es1b only
  });

  it('AC-03 chat pinned to old commit keeps querying it after branch head moves', async () => {
    const sessionId = await new AgentPersistenceService(adapter as any).createSession(P, 'r1', 'c1', 'S1');
    const head = await retrieval.resolveActiveSnapshot('r1', 'refs/heads/main');
    expect(head).toMatchObject({ id: 'S2' }); // branch already moved
    const pin = await resolvePinnedContext(adapter as any, retrieval, { session_id: sessionId, index_snapshot_id: 'S1' });
    expect(pin).toMatchObject({ indexSnapshotId: 'S1', commitId: 'c1' });
    const hits = await retrieval.symbolByName(pin.indexSnapshotId, 'AuthService');
    expect(hits.map((h) => h.id)).toEqual(['s-auth1']);
  });

  it('AC-04 rename: old path correct at old commit, new path at new commit', async () => {
    const pathOf = (snapshotId: string) => adapter.get<{ p: string }>(
      `SELECT sfr.relative_path AS p FROM code_symbol s JOIN source_file_revision sfr ON sfr.id = s.sfr_id
       WHERE s.snapshot_id = ? AND s.name = 'AuthService'`, [snapshotId])?.p;
    expect(pathOf('S1')).toBe('src/old/auth.ts');
    expect(pathOf('S2')).toBe('src/new/auth.ts');
    expect(pathOf('S3')).toBe('src/new/auth.ts'); // merge result keeps the new path
  });

  it('AC-05 delete: queryable at the old commit, absent at the delete commit', async () => {
    expect((await retrieval.symbolByName('S1', 'AuthService')).map((h) => h.id)).toEqual(['s-auth1']);
    expect(await retrieval.symbolByName('S4', 'AuthService')).toEqual([]);
    const oldPaths = adapter.all<{ p: string }>(`SELECT relative_path AS p FROM source_file_revision WHERE commit_id = 'c1'`);
    const delPaths = adapter.all<{ p: string }>(`SELECT relative_path AS p FROM source_file_revision WHERE commit_id = 'cdel'`);
    expect(oldPaths.map((r) => r.p)).toContain('src/old/auth.ts');
    expect(delPaths.map((r) => r.p)).not.toContain('src/old/auth.ts');
    expect(delPaths.map((r) => r.p)).not.toContain('src/new/auth.ts');
  });

  it('AC-06 merge commit with two parents is indexed correctly', async () => {
    const parents = adapter.all<{ parent_commit_id: string }>(
      `SELECT parent_commit_id FROM git_commit_parent WHERE commit_id = 'c3' ORDER BY parent_order`,
    );
    expect(parents.map((p) => p.parent_commit_id)).toEqual(['c1', 'c2']);
    const snap = adapter.get<any>(`SELECT commit_id, status FROM code_index_snapshot WHERE id = 'S3'`);
    expect(snap).toMatchObject({ commit_id: 'c3', status: 'READY' });
    expect((await retrieval.symbolByName('S3', 'AuthService')).map((h) => h.id)).toEqual(['s-auth3']);
  });

  it('AC-07 every artifact belongs to its required snapshot (DB-enforced)', async () => {
    const snapshotIds = new Set(adapter.all<{ id: string }>(`SELECT id FROM code_index_snapshot`).map((r) => r.id));
    const symbolSnaps = adapter.all<{ snapshot_id: string }>(`SELECT DISTINCT snapshot_id FROM code_symbol`).map((r) => r.snapshot_id);
    const chunkSnaps = adapter.all<{ snapshot_id: string }>(`SELECT DISTINCT snapshot_id FROM code_chunk`).map((r) => r.snapshot_id);
    const embSnaps = adapter.all<{ code_index_snapshot_id: string }>(
      `SELECT DISTINCT code_index_snapshot_id FROM embedding_set`).map((r) => r.code_index_snapshot_id);
    for (const id of [...symbolSnaps, ...chunkSnaps, ...embSnaps]) expect(snapshotIds.has(id)).toBe(true);
    expect(() => adapter.exec(`INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, parent_id, name, kind, start_line, end_line)
      VALUES ('bad-parent', '${P}', 'S2', 'f2', 's-auth1', 'x', 'class', 1, 2)`)).toThrow(/same snapshot/);
    expect(() => adapter.exec(`INSERT INTO chat_session (id, project_id, repository_id, commit_id, pinned_code_index_snapshot_id)
      VALUES ('bad-pin', '${P}', 'r1', 'c1', 'S5')`)).toThrow(/pinned snapshot must match/);
  });

  it('AC-08 vector/lexical queries never leak across snapshot or repository', async () => {
    const s1 = await retrieval.vectorSearch('S1', 'local-minilm', '1.0', vec(1, 0, 0, 0), 10);
    expect(s1.map((h) => h.chunkId)).toEqual(['ch1', 'ch1b']); // no ch2/ch3/ch5/ch6
    const s5 = await retrieval.vectorSearch('S5', 'local-minilm', '1.0', vec(1, 0, 0, 0), 10);
    expect(s5.map((h) => h.chunkId)).toEqual(['ch5']); // r2 only
    const lexical = await retrieval.lexicalSearch('S1', 'authorization', 10);
    expect(lexical.map((h) => h.chunkId)).toEqual(['ch1']);
    const lexicalS2 = await retrieval.lexicalSearch('S2', 'authorization', 10);
    expect(lexicalS2.map((h) => h.chunkId)).toEqual(['ch2']);
  });
});
