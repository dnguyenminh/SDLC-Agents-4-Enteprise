/**
 * SA4E-427 — Acceptance criteria 09–12: filtered recall, re-index after
 * dependency change, failure cascade, resume (16K Doc §19).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SnapshotIndexPipeline } from '../../pipeline/index-pipeline.js';
import { SnapshotRetrievalService } from '../../retrieval/snapshot-retrieval.js';
import { AgentPersistenceService } from '../../agent/agent-persistence.js';
import { loadRunState, summarizeForResume } from '../../agent/agent-state-recovery.js';
import { vec, makeAcceptanceDb, P } from './ac-fixtures.js';

const TARGET = (snapshotId: string) => ({ projectId: P, repositoryId: 'r1', commitId: 'c1', snapshotId });

describe('SA4E-427 acceptance criteria 09–12', () => {
  let adapter: SqliteAdapter;
  let retrieval: SnapshotRetrievalService;

  beforeEach(async () => {
    adapter = await makeAcceptanceDb();
    retrieval = new SnapshotRetrievalService(adapter as any);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('AC-09 filtered recall + result-count on the multi-snapshot dataset', async () => {
    const query = vec(1, 0, 0, 0);
    const groundTruth = await retrieval.vectorSearch('S1', 'local-minilm', '1.0', query, 10);
    expect(groundTruth.map((h) => h.chunkId)).toEqual(['ch1', 'ch1b']); // filter applied first
    const top2 = await retrieval.vectorSearch('S1', 'local-minilm', '1.0', query, 2);
    const recallAt2 = top2.filter((h) => groundTruth.some((g) => g.chunkId === h.chunkId)).length / 2;
    expect(recallAt2).toBe(1); // exact SQLite scan → 100% recall on the pinned set
    expect(top2).toHaveLength(2);
    expect(await retrieval.vectorSearch('S1', 'local-minilm', '1.0', query, 1)).toHaveLength(1);
    // count per snapshot is exact (multi-snapshot dataset)
    const count = async (snapshotId: string) =>
      (await retrieval.vectorSearch(snapshotId, 'local-minilm', '1.0', query, 10)).length;
    expect({ S1: await count('S1'), S2: await count('S2'), S3: await count('S3'), S5: await count('S5') })
      .toEqual({ S1: 2, S2: 1, S3: 1, S5: 1 });
  });

  it('AC-10 semantic re-run after dependency/classpath change (source unchanged)', async () => {
    const calls: string[] = [];
    const handlers: any = {
      E_DEPENDENCY_RESOLUTION: { kind: 'per-language', handlers: { typescript: async () => { calls.push('E'); return { status: 'OK' }; } } },
      F_SEMANTIC_INDEX: { kind: 'per-language', handlers: { typescript: async () => { calls.push('F'); return { status: 'OK' }; } } },
    };
    const sourceBefore = adapter.all<{ relative_path: string; content_hash: string }>(
      `SELECT relative_path, content_hash FROM source_file_revision WHERE commit_id = 'c1' ORDER BY relative_path`);
    const s1Before = adapter.get<{ n: number }>(`SELECT COUNT(*) AS n FROM code_symbol WHERE snapshot_id = 'S1'`)?.n;
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, TARGET('S7'), ['typescript']).run();
    expect(calls).toEqual(['E', 'F']); // semantic pipeline re-ran
    expect(result.snapshotStatus).toBe('READY');
    const s7 = adapter.get<any>(`SELECT commit_id, config_fingerprint FROM code_index_snapshot WHERE id = 'S7'`);
    expect(s7).toMatchObject({ commit_id: 'c1', config_fingerprint: 'fp-reindex' }); // same source, new config
    expect(adapter.all(`SELECT relative_path, content_hash FROM source_file_revision WHERE commit_id = 'c1' ORDER BY relative_path`))
      .toEqual(sourceBefore); // source bytes unchanged
    expect(adapter.get<{ n: number }>(`SELECT COUNT(*) AS n FROM code_symbol WHERE snapshot_id = 'S1'`)?.n).toBe(s1Before);
    expect(adapter.get<any>(`SELECT status FROM code_index_snapshot WHERE id = 'S1'`)?.status).toBe('READY');
  });

  it('AC-11 dependency failure → no fake semantic coverage cascade', async () => {
    const calls: string[] = [];
    const handlers: any = {
      E_DEPENDENCY_RESOLUTION: {
        kind: 'per-language',
        handlers: {
          typescript: async () => ({ status: 'OK' }),
          java: async () => { throw new Error('no JDK toolchain'); },
        },
      },
      F_SEMANTIC_INDEX: {
        kind: 'per-language',
        handlers: {
          typescript: async () => ({ status: 'OK' }),
          java: async () => { calls.push('F:java'); return { status: 'OK' }; },
        },
      },
    };
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, TARGET('S8'), ['typescript', 'java']).run();
    const coverage = Object.fromEntries(result.coverage.map((c) => [c.language, c.capability]));
    expect(coverage).toEqual({ typescript: 'supported', java: 'failed' }); // never "supported" on failure
    expect(calls).toEqual([]); // F never ran for the failed language
    expect(result.snapshotStatus).toBe('READY'); // language failures are soft, not fake coverage
  });

  it('AC-12 agent restart → resume from persisted plan/step/approval', async () => {
    const svc1 = new AgentPersistenceService(adapter as any);
    const sessionId = await svc1.createSession(P, 'r1', 'c1', 'S1');
    const runId = await svc1.createRun(sessionId, P);
    const planId = await svc1.savePlan(runId, P, 'fix payment retry', 'tests pass');
    await svc1.setPlanStatus(planId, P, runId, 'APPROVED');
    const s0 = await svc1.addStep(runId, P, planId, 0);
    const s1 = await svc1.addStep(runId, P, planId, 1);
    await svc1.setStepStatus(s0, runId, P, 'DONE');
    const approvalId = await svc1.requestApproval(runId, P, 'write_file', 'src/auth.ts');
    const state = await loadRunState(adapter as any, runId);
    const summary = summarizeForResume(state);
    expect(summary).toMatchObject({ objective: 'fix payment retry', planStatus: 'APPROVED', nextStepId: s1, nextStepIndex: 1 });
    expect(summary.pendingApprovalIds).toEqual([approvalId]);
    // a FRESH service instance resumes without in-memory state
    const svc2 = new AgentPersistenceService(adapter as any);
    expect(await svc2.resumePoint(runId)).toMatchObject({ lastCompletedStepIndex: 0, nextStepId: s1 });
  });
});
