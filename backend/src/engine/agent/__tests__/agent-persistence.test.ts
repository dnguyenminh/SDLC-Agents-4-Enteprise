/**
 * SA4E-416 — Agent persistence tests (16K Doc §10.6 + §15).
 * AC: FK ownership, durable event log before SSE, reference-only payloads,
 * resume after restart, approval workflow with decision_time.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';
import { AgentPersistenceService } from '../agent-persistence.js';
import { AgentEventLog } from '../agent-event-log.js';

const P = 'proj1';

describe('SA4E-416 agent persistence', () => {
  let adapter: SqliteAdapter;
  let svc: AgentPersistenceService;

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
    svc = new AgentPersistenceService(adapter as any);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  async function seedRun(): Promise<{ sessionId: string; runId: string; planId: string; steps: string[] }> {
    const sessionId = await svc.createSession(P, 'r1', 'c1', 'S1', { model: 'test' });
    const runId = await svc.createRun(sessionId, P);
    const planId = await svc.savePlan(runId, P, 'implement login', 'tests pass');
    await svc.setPlanStatus(planId, P, runId, 'APPROVED');
    const steps = [
      await svc.addStep(runId, P, planId, 0, { inputRef: 'ref:snapshot:S1' }),
      await svc.addStep(runId, P, planId, 1, { dependencyIds: ['step0'] }),
      await svc.addStep(runId, P, planId, 2, { dependencyIds: ['step1'] }),
      await svc.addStep(runId, P, planId, 3, { dependencyIds: ['step2'] }),
    ];
    return { sessionId, runId, planId, steps };
  }

  it('FK ownership: every entity references agent_run (bad run id rejected)', async () => {
    const { runId, planId, steps } = await seedRun();
    expect(runId).toBeTruthy();
    expect(() =>
      adapter.run(
        `INSERT INTO agent_step (id, project_id, agent_run_id, step_index, status) VALUES ('x', ?, 'nope', 9, 'PENDING')`,
        [P],
      ),
    ).toThrow();
    const n = adapter.get<{ c: number }>(`SELECT COUNT(*) AS c FROM agent_step WHERE agent_run_id = ?`, [runId])?.c;
    expect(n).toBe(4);
    expect(planId).toBeTruthy();
    expect(steps).toHaveLength(4);
  });

  it('restart resume: agent resumes from last completed step (AC #12)', async () => {
    const { runId, steps } = await seedRun();
    // simulate a crashed run: steps 0,1 done; step 2 was RUNNING when it died
    await svc.setStepStatus(steps[0], runId, P, 'DONE');
    await svc.setStepStatus(steps[1], runId, P, 'DONE');
    await svc.setStepStatus(steps[2], runId, P, 'RUNNING');
    const rp = await svc.resumePoint(runId);
    expect(rp.lastCompletedStepIndex).toBe(1);
    expect(rp.nextStepIndex).toBe(2);
    expect(rp.nextStepId).toBe(steps[2]);
    // resume: retry step 2 (attempts increments), then complete it
    await svc.setStepStatus(steps[2], runId, P, 'RUNNING');
    await svc.setStepStatus(steps[2], runId, P, 'DONE');
    const attempts = adapter
      .get<{ a: number }>(`SELECT attempts AS a FROM agent_step WHERE id = ?`, [steps[2]])?.a;
    expect(attempts).toBe(2);
  });

  it('approval workflow: create → user decision → decision_time persisted', async () => {
    const { runId } = await seedRun();
    const changesetId = await svc.createChangeSet(runId, P, 'c1', 'add login');
    const approvalId = await svc.requestApproval(runId, P, 'write_file', 'src/auth.ts', changesetId, 'user1');
    const before = adapter.get<any>(`SELECT decision, decision_time FROM approval_request WHERE id = ?`, [approvalId]);
    expect(before.decision).toBe('PENDING');
    expect(before.decision_time).toBeNull();
    await svc.decideApproval(approvalId, runId, P, 'APPROVED', 'reviewer1');
    const after = adapter.get<any>(`SELECT decision, decided_by, decision_time FROM approval_request WHERE id = ?`, [approvalId]);
    expect(after.decision).toBe('APPROVED');
    expect(after.decided_by).toBe('reviewer1');
    expect(after.decision_time).not.toBeNull();
  });

  it('durable event log BEFORE SSE: append → row committed, replay by Last-Event-ID', async () => {
    const { runId } = await seedRun();
    const log = new AgentEventLog(adapter as any);
    const e1 = await log.append(runId, P, 'STEP_STATUS', { stepId: 's0', status: 'DONE' });
    const e2 = await log.append(runId, P, 'STEP_STATUS', { stepId: 's1', status: 'DONE' });
    expect(e1).toBeLessThan(e2);
    // durable: already queryable — this is the point where SSE would publish
    const rows = adapter.all<any>(`SELECT id, type FROM agent_event WHERE agent_run_id = ? ORDER BY id`, [runId]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const replay = await log.replay(runId, e1);
    expect(replay.map((r) => r.id)).toEqual([e2]);
  });

  it('reference-only payloads: large content rejected with PAYLOAD_TOO_LARGE (§15)', async () => {
    const { runId } = await seedRun();
    const huge = { blob: 'x'.repeat(3000) };
    // raw SQL insert allowed — the GUARD lives in the service layer
    expect(() =>
      adapter.run(
        `INSERT INTO agent_tool_execution (id, project_id, agent_run_id, tool_name, args_json, status)
         VALUES ('tx', ?, ?, 'read_code_block', ?, 'OK')`,
        [P, runId, JSON.stringify(huge)],
      ),
    ).not.toThrow();
    await expect(svc.recordToolExecution(runId, P, null, 'read_code_block', huge)).rejects.toThrow(/PAYLOAD_TOO_LARGE/);
    await expect(svc.recordToolExecution(runId, P, null, 'read_code_block', { evidenceId: 're1' })).resolves.toBeTruthy();
  });

  it('state transitions recorded for the run', async () => {
    const { runId } = await seedRun();
    await svc.transition(runId, P, 'RUNNING', 'WAITING_APPROVAL', 'approval requested');
    const n = adapter.get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM agent_state_transition WHERE agent_run_id = ?`,
      [runId],
    )?.c;
    expect(n).toBeGreaterThanOrEqual(2); // CREATED→RUNNING + this one
  });
});
