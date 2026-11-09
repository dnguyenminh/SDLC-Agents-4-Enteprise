/**
 * SA4E-423 — state recovery tests: full resume after restart (AC #12 hard),
 * SSE reconnect replay without duplicate/missing events (AC #16), approval
 * lifecycle notify→decide ordering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';
import { AgentPersistenceService } from '../agent-persistence.js';
import { AgentEventLog } from '../agent-event-log.js';
import {
  loadRunState,
  summarizeForResume,
  verifyEventContiguity,
} from '../agent-state-recovery.js';

const P = 'proj1';

describe('SA4E-423 agent state recovery', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    adapter.exec(
      `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
       INSERT INTO schema_version (version) VALUES (5);`,
    );
    await applyMigrationV6(adapter as any);
    adapter.exec(`
      INSERT INTO repository (id, project_id, origin_url, display_name) VALUES ('r1', '${P}', 'https://x.git', 'repo');
      INSERT INTO git_commit (id, project_id, repository_id, commit_sha) VALUES ('c1', '${P}', 'r1', 'sha-1');
      INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
        VALUES ('S1', '${P}', 'r1', 'c1', 'fp1', 'v1', 'READY');
    `);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  /** Build a realistic run with the FIRST service instance ("before restart"). */
  async function seedRun(svc: AgentPersistenceService) {
    const sessionId = await svc.createSession(P, 'r1', 'c1', 'S1', { model: 'qwen' });
    const runId = await svc.createRun(sessionId, P);
    const planId = await svc.savePlan(runId, P, 'implement payment retry', 'retry tests pass');
    await svc.setPlanStatus(planId, P, runId, 'APPROVED');
    const steps = [
      await svc.addStep(runId, P, planId, 0, { inputRef: 'ref:snapshot:S1' }),
      await svc.addStep(runId, P, planId, 1, { dependencyIds: ['s0'] }),
      await svc.addStep(runId, P, planId, 2, { dependencyIds: ['s1'] }),
    ];
    await svc.setStepStatus(steps[0], runId, P, 'DONE');
    await svc.setStepStatus(steps[1], runId, P, 'RUNNING');
    await svc.recordEvidence(runId, P, 'S1', 'where is retry logic', ['ch1'], 0.9);
    const changesetId = await svc.createChangeSet(runId, P, 'c1', 'retry patch');
    const approvalId = await svc.requestApproval(runId, P, 'write_file', 'src/pay.ts', changesetId, 'user1');
    return { sessionId, runId, planId, steps, changesetId, approvalId };
  }

  it('restart simulation: FULL resume from persisted state, zero in-memory state (AC #12 hard)', async () => {
    // "before restart" — first service instance
    const svc1 = new AgentPersistenceService(adapter as any);
    const { runId, planId, steps, approvalId } = await seedRun(svc1);
    await svc1.decideApproval(approvalId, runId, P, 'APPROVED', 'reviewer1');

    // "restart" — a FRESH service instance over the SAME database
    const svc2 = new AgentPersistenceService(adapter as any);
    const state = await loadRunState(adapter as any, runId);
    const summary = summarizeForResume(state);

    // plan persisted
    expect(summary.objective).toBe('implement payment retry');
    expect(summary.planStatus).toBe('APPROVED');
    // steps persisted with statuses (no loss of in-progress work)
    expect(summary.stepsTotal).toBe(3);
    expect(summary.stepsDone).toBe(1);
    expect(summary.lastDoneStepIndex).toBe(0);
    expect(summary.nextStepIndex).toBe(1);
    expect(summary.nextStepId).toBe(steps[1]);
    // approval decision persisted
    expect(summary.pendingApprovalIds).toHaveLength(0);
    const approval = state.approvals.find((a) => a.id === approvalId) as any;
    expect(approval.decision).toBe('APPROVED');
    expect(approval.decision_time).not.toBeNull();
    // the resumed instance can keep driving the run (resumePoint works cross-instance)
    const rp = await svc2.resumePoint(runId);
    expect(rp.lastCompletedStepIndex).toBe(0);
    expect(rp.nextStepId).toBe(steps[1]);
    void planId;
  });

  it('SSE replay (AC #16): no duplicate, no missing across reconnects', async () => {
    const svc = new AgentPersistenceService(adapter as any);
    const { runId } = await seedRun(svc);
    const report = await verifyEventContiguity(adapter as any, runId);
    expect(report.contiguous).toBe(true);
    expect(report.gaps).toEqual([]);
    expect(report.duplicates).toEqual([]);
    // replay from any Last-Event-ID yields exactly the later events, twice identical
    const log = new AgentEventLog(adapter as any);
    const mid = Math.floor((report.lastId ?? 0) / 2) + (report.firstId ?? 0);
    const replay1 = await log.replay(runId, mid);
    const replay2 = await log.replay(runId, mid);
    expect(replay1.map((e) => e.id)).toEqual(replay2.map((e) => e.id));
    expect(replay1.every((e) => e.id > mid)).toBe(true);
    // full replay = every event exactly once
    const full = await log.replay(runId, 0);
    expect(new Set(full.map((e) => e.id)).size).toBe(full.length);
    expect(full.length).toBe(report.count);
  });

  it('approval lifecycle: create → notify (event) → decide → persist + contiguity holds', async () => {
    const svc = new AgentPersistenceService(adapter as any);
    const { runId, approvalId } = await seedRun(svc);
    // notify event exists BEFORE the decision (durable-before-publish contract)
    const before = await loadRunState(adapter as any, runId);
    const notified = before.events.find((e) => e.type === 'APPROVAL_REQUESTED');
    expect(notified).toBeDefined();
    const decidedYet = before.approvals.find((a) => a.id === approvalId) as any;
    expect(decidedYet.decision).toBe('PENDING');
    // decide
    await svc.decideApproval(approvalId, runId, P, 'APPROVED', 'reviewer1');
    const after = await loadRunState(adapter as any, runId);
    const decided = after.approvals.find((a) => a.id === approvalId) as any;
    expect(decided.decision).toBe('APPROVED');
    expect(decided.decision_time).not.toBeNull();
    const decisionEvent = after.events.find((e) => e.type === 'APPROVAL_DECIDED');
    expect(decisionEvent).toBeDefined();
    // contiguity still holds after all writes
    const report = await verifyEventContiguity(adapter as any, runId);
    expect(report.contiguous).toBe(true);
  });

  it('unknown run → empty snapshot (no crash)', async () => {
    const state = await loadRunState(adapter as any, 'nope');
    expect(state.run).toBeNull();
    expect(state.session).toBeNull();
    expect(state.steps).toHaveLength(0);
    const summary = summarizeForResume(state);
    expect(summary.stepsTotal).toBe(0);
    expect(summary.nextStepId).toBeNull();
  });
});
