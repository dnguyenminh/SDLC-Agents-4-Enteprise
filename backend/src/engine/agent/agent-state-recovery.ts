/**
 * SA4E-423 — Agent state recovery: FULL resume from persisted state (16K Doc
 * §15) + event-log hardening for SSE reconnect (AC #16).
 *
 * - loadRunState(): reconstructs the ENTIRE run (session, run, plans, steps,
 *   transitions, approvals, change sets, tool executions, evidence, events)
 *   from persistence — a fresh AgentPersistenceService over the same DB can
 *   resume with zero in-memory state (restart simulation).
 * - verifyEventContiguity(): SSE replay guarantee — event ids must be
 *   consecutive (no gaps = no missing events; uniqueness = no duplicates).
 *
 * State channels mapping (ARCH.md §6.3): plan/steps/transitions/approvals are
 * the persisted channels; loadRunState() is the channel snapshot.
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

export interface RunStateSnapshot {
  session: Record<string, unknown> | null;
  run: Record<string, unknown> | null;
  plans: Array<Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
  transitions: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  changeSets: Array<Record<string, unknown>>;
  toolExecutions: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  events: Array<{ id: number; type: string; payload_json: string | null; created_at: string }>;
}

/** Reconstruct the full persisted state of one agent run. */
export async function loadRunState(db: QueryDatabaseAdapter, runId: string): Promise<RunStateSnapshot> {
  const run = (await db.getAsync<Record<string, unknown>>(`SELECT * FROM agent_run WHERE id = ?`, [runId])) ?? null;
  const session = run
    ? ((await db.getAsync<Record<string, unknown>>(`SELECT * FROM chat_session WHERE id = ?`, [run.chat_session_id as string])) ?? null)
    : null;
  const plans = await db.allAsync<Record<string, unknown>>(
    `SELECT * FROM agent_plan WHERE agent_run_id = ? ORDER BY version, rowid`, [runId]);
  const steps = await db.allAsync<Record<string, unknown>>(
    `SELECT * FROM agent_step WHERE agent_run_id = ? ORDER BY step_index, rowid`, [runId]);
  const transitions = await db.allAsync<Record<string, unknown>>(
    `SELECT * FROM agent_state_transition WHERE agent_run_id = ? ORDER BY rowid`, [runId]);
  const approvals = await db.allAsync<Record<string, unknown>>(
    `SELECT * FROM approval_request WHERE agent_run_id = ? ORDER BY rowid`, [runId]);
  const changeSets = await db.allAsync<Record<string, unknown>>(
    `SELECT * FROM change_set WHERE agent_run_id = ? ORDER BY rowid`, [runId]);
  const toolExecutions = await db.allAsync<Record<string, unknown>>(
    `SELECT * FROM agent_tool_execution WHERE agent_run_id = ? ORDER BY rowid`, [runId]);
  const evidence = await db.allAsync<Record<string, unknown>>(
    `SELECT * FROM retrieval_evidence WHERE agent_run_id = ? ORDER BY rowid`, [runId]);
  const events = await db.allAsync<{ id: number; type: string; payload_json: string | null; created_at: string }>(
    `SELECT id, type, payload_json, created_at FROM agent_event WHERE agent_run_id = ? ORDER BY id ASC`, [runId]);
  return { session, run, plans, steps, transitions, approvals, changeSets, toolExecutions, evidence, events };
}

export interface EventContiguityReport {
  contiguous: boolean;
  /** total event rows for the run. */
  count: number;
  /** first/last id (null when no events). */
  firstId: number | null;
  lastId: number | null;
  /** missing ids inside [firstId, lastId] — empty when contiguous. */
  gaps: number[];
  /** duplicated ids (must always be empty — PK guarantees). */
  duplicates: number[];
}

/**
 * SSE reconnect guarantee (AC #16): event ids are consecutive integers, so a
 * replay from any Last-Event-ID yields every later event exactly once — no
 * duplicate, no missing.
 */
export async function verifyEventContiguity(
  db: QueryDatabaseAdapter,
  runId: string,
): Promise<EventContiguityReport> {
  const rows = await db.allAsync<{ id: number }>(
    `SELECT id FROM agent_event WHERE agent_run_id = ? ORDER BY id ASC`, [runId]);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return { contiguous: true, count: 0, firstId: null, lastId: null, gaps: [], duplicates: [] };
  }
  const firstId = ids[0];
  const lastId = ids[ids.length - 1];
  const seen = new Set<number>();
  const duplicates: number[] = [];
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  const gaps: number[] = [];
  for (let i = firstId; i <= lastId; i++) {
    if (!seen.has(i)) gaps.push(i);
  }
  return { contiguous: gaps.length === 0 && duplicates.length === 0, count: ids.length, firstId, lastId, gaps, duplicates };
}

/** Resume summary derived from the snapshot — what the restarted agent needs. */
export interface ResumeSummary {
  runStatus: string | null;
  planStatus: string | null;
  objective: string | null;
  stepsTotal: number;
  stepsDone: number;
  lastDoneStepIndex: number | null;
  nextStepId: string | null;
  nextStepIndex: number | null;
  pendingApprovalIds: string[];
  eventCount: number;
}

export function summarizeForResume(state: RunStateSnapshot): ResumeSummary {
  const steps = state.steps as Array<{ step_index: number; status: string; id: string }>;
  const done = steps.filter((s) => s.status === 'DONE');
  const pending = steps.find((s) => s.status !== 'DONE');
  const plan = (state.plans as Array<{ status: string; objective: string }>)[state.plans.length - 1] ?? null;
  const pendingApprovals = (state.approvals as Array<{ id: string; decision: string }>)
    .filter((a) => a.decision === 'PENDING')
    .map((a) => a.id);
  const run = state.run as { status?: string } | null;
  return {
    runStatus: run?.status ?? null,
    planStatus: plan?.status ?? null,
    objective: plan?.objective ?? null,
    stepsTotal: steps.length,
    stepsDone: done.length,
    lastDoneStepIndex: done.length > 0 ? Math.max(...done.map((s) => s.step_index)) : null,
    nextStepId: pending?.id ?? null,
    nextStepIndex: pending?.step_index ?? null,
    pendingApprovalIds: pendingApprovals,
    eventCount: state.events.length,
  };
}
