/** SA4E-416 — Agent Plan/Step/Approval persistence (16K Doc §10.6 + §15).
 *  Service layer over migration-V6 tables; enforces: FK ownership to agent_run,
 *  reference-only payloads (§15), resumePoint() for restart resume (AC #12),
 *  approval workflow (decision_time persisted), durable event log BEFORE SSE. */

import { randomUUID } from 'node:crypto';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { AgentEventLog, assertReferenceOnly } from './agent-event-log.js';

const uuid = () => randomUUID();

export interface ResumePoint {
  lastCompletedStepIndex: number | null;
  nextStepId: string | null;
  nextStepIndex: number | null;
}

export class AgentPersistenceService {
  readonly events: AgentEventLog;

  constructor(private readonly db: QueryDatabaseAdapter) {
    this.events = new AgentEventLog(db);
  }

  async createSession(
    projectId: string,
    repositoryId: string,
    commitId: string,
    pinnedSnapshotId: string,
    modelConfig?: unknown,
  ): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO chat_session (id, project_id, repository_id, commit_id, pinned_code_index_snapshot_id, model_config_snapshot)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, projectId, repositoryId, commitId, pinnedSnapshotId, modelConfig ? assertReferenceOnly(modelConfig) : null],
    );
    return id;
  }

  async createRun(sessionId: string, projectId: string): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO agent_run (id, project_id, chat_session_id, status, started_at)
       VALUES (?, ?, ?, 'RUNNING', datetime('now'))`,
      [id, projectId, sessionId],
    );
    await this.transition(id, projectId, 'CREATED', 'RUNNING', 'run started');
    await this.events.append(id, projectId, 'RUN_STARTED', { sessionId });
    return id;
  }

  async savePlan(runId: string, projectId: string, objective: string, acceptanceCriteria?: string, version = 0): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO agent_plan (id, project_id, agent_run_id, version, objective, acceptance_criteria, status)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT')`,
      [id, projectId, runId, version, objective, acceptanceCriteria ?? null],
    );
    await this.events.append(runId, projectId, 'PLAN_CREATED', { planId: id, version, objectiveRef: true });
    return id;
  }

  async setPlanStatus(planId: string, projectId: string, runId: string, status: 'APPROVED' | 'EXECUTING' | 'DONE' | 'REJECTED'): Promise<void> {
    await this.db.runAsync(`UPDATE agent_plan SET status = ? WHERE id = ?`, [status, planId]);
    await this.events.append(runId, projectId, 'PLAN_STATUS', { planId, status });
  }
  async addStep(
    runId: string,
    projectId: string,
    planId: string | null,
    stepIndex: number,
    deps?: { dependencyIds?: string[]; inputRef?: string; outputRef?: string },
  ): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO agent_step (id, project_id, agent_run_id, plan_id, step_index, dependency_ids, input_ref, output_ref, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        id, projectId, runId, planId, stepIndex,
        deps?.dependencyIds ? assertReferenceOnly(deps.dependencyIds) : null,
        deps?.inputRef ?? null, deps?.outputRef ?? null,
      ],
    );
    await this.events.append(runId, projectId, 'STEP_ADDED', { stepId: id, stepIndex });
    return id;
  }

  async setStepStatus(stepId: string, runId: string, projectId: string, status: 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED'): Promise<void> {
    if (status === 'RUNNING') {
      await this.db.runAsync(
        `UPDATE agent_step SET status = 'RUNNING', attempts = attempts + 1, started_at = datetime('now') WHERE id = ?`,
        [stepId],
      );
    } else {
      await this.db.runAsync(
        `UPDATE agent_step SET status = ?, finished_at = datetime('now') WHERE id = ?`,
        [status, stepId],
      );
    }
    await this.events.append(runId, projectId, 'STEP_STATUS', { stepId, status });
  }

  /** AC #12 — resume after restart: last completed step + next step to execute. */
  async resumePoint(runId: string): Promise<ResumePoint> {
    const last = await this.db.getAsync<{ idx: number | null }>(
      `SELECT MAX(step_index) AS idx FROM agent_step WHERE agent_run_id = ? AND status = 'DONE'`,
      [runId],
    );
    const next = await this.db.getAsync<{ id: string; idx: number }>(
      `SELECT id, step_index AS idx FROM agent_step
       WHERE agent_run_id = ? AND status != 'DONE'
       ORDER BY step_index ASC LIMIT 1`,
      [runId],
    );
    return {
      lastCompletedStepIndex: last?.idx ?? null,
      nextStepId: next?.id ?? null,
      nextStepIndex: next?.idx ?? null,
    };
  }

  async recordToolExecution(runId: string, projectId: string, stepId: string | null, toolName: string, argsRef?: unknown): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO agent_tool_execution (id, project_id, agent_run_id, step_id, tool_name, args_json, status)
       VALUES (?, ?, ?, ?, ?, ?, 'OK')`,
      [id, projectId, runId, stepId, toolName, argsRef !== undefined ? assertReferenceOnly(argsRef) : null],
    );
    await this.events.append(runId, projectId, 'TOOL_EXECUTED', { executionId: id, toolName });
    return id;
  }

  async recordEvidence(runId: string, projectId: string, snapshotId: string, query: string, resultRefs: string[], score?: number): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO retrieval_evidence (id, project_id, agent_run_id, snapshot_id, query, result_refs, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, runId, snapshotId, query, assertReferenceOnly(resultRefs), score ?? null],
    );
    await this.events.append(runId, projectId, 'RETRIEVAL_EVIDENCE', { evidenceId: id });
    return id;
  }
  async registerWorkspace(runId: string, projectId: string, path: string, purpose?: string): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO agent_workspace (id, project_id, agent_run_id, path, purpose) VALUES (?, ?, ?, ?, ?)`,
      [id, projectId, runId, path, purpose ?? null],
    );
    return id;
  }

  async createChangeSet(runId: string, projectId: string, baseCommitId: string, summary?: string): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO change_set (id, project_id, agent_run_id, base_commit_id, summary, status) VALUES (?, ?, ?, ?, ?, 'OPEN')`,
      [id, projectId, runId, baseCommitId, summary ?? null],
    );
    await this.events.append(runId, projectId, 'CHANGE_SET_CREATED', { changeSetId: id });
    return id;
  }

  async requestApproval(
    runId: string,
    projectId: string,
    action: string,
    scope: string,
    changesetId?: string,
    requestedUser?: string,
  ): Promise<string> {
    const id = uuid();
    await this.db.runAsync(
      `INSERT INTO approval_request (id, project_id, agent_run_id, action, scope, proposed_changeset_id, requested_user, decision)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [id, projectId, runId, action, scope, changesetId ?? null, requestedUser ?? null],
    );
    await this.events.append(runId, projectId, 'APPROVAL_REQUESTED', { approvalId: id, action, scope });
    return id;
  }

  /** Approval workflow: create → user decision → decision_time persisted. */
  async decideApproval(approvalId: string, runId: string, projectId: string, decision: 'APPROVED' | 'REJECTED', decidedBy: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE approval_request SET decision = ?, decided_by = ?, decision_time = datetime('now') WHERE id = ?`,
      [decision, decidedBy, approvalId],
    );
    await this.events.append(runId, projectId, 'APPROVAL_DECIDED', { approvalId, decision, decidedBy });
  }

  async transition(runId: string, projectId: string, oldState: string, newState: string, reason?: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO agent_state_transition (id, project_id, agent_run_id, old_state, new_state, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), projectId, runId, oldState, newState, reason ?? null],
    );
    await this.events.append(runId, projectId, 'STATE_TRANSITION', { oldState, newState });
  }
}
