/**
 * SA4E-425 — SSE durable event log & replay tests (16K Doc §15/§17).
 * Durable-before-emit, Last-Event-ID replay (0 dup / 0 missing), gap refusal,
 * configurable retention, agent_state_transition integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';
import { AgentPersistenceService } from '../agent-persistence.js';
import { PayloadTooLargeError } from '../agent-event-log.js';
import { loadRunState } from '../agent-state-recovery.js';
import {
  SseEventTransport,
  SseGapError,
  formatSseFrame,
  parseLastEventId,
  pruneEventLog,
  resolveRetentionPolicy,
  DEFAULT_RETENTION_POLICY,
} from '../sse-stream.js';

const P = 'proj1';

/** Frames → event ids parsed from the `id:` line. */
function frameIds(frames: string[]): number[] {
  return frames.map((f) => Number.parseInt(f.split('\n')[0].replace('id: ', ''), 10));
}

/** Frame → data line (JSON). */
function frameData(frame: string): any {
  const line = frame.split('\n').find((l) => l.startsWith('data: ')) ?? 'data: null';
  return JSON.parse(line.slice('data: '.length));
}

describe('SA4E-425 SSE durable event log & replay', () => {
  let adapter: SqliteAdapter;
  let transport: SseEventTransport;
  let runId: string;

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
    const persistence = new AgentPersistenceService(adapter as any);
    const sessionId = await persistence.createSession(P, 'r1', 'c1', 'S1');
    runId = await persistence.createRun(sessionId, P); // durable event id 1: RUN_STARTED
    transport = new SseEventTransport(adapter as any);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('durable BEFORE emission: frame returned only after the row exists', async () => {
    const frame = await transport.publish(runId, P, 'TOOL_EXECUTED', { executionId: 'x1', toolName: 'read_file' });
    const id = frameIds([frame])[0];
    const row = adapter.get<any>(`SELECT id, type, payload_json FROM agent_event WHERE id = ?`, [id]);
    expect(row.type).toBe('TOOL_EXECUTED');
    expect(JSON.parse(row.payload_json).toolName).toBe('read_file');
    // failure path: oversized payload throws BEFORE any frame is produced
    const before = adapter.get<any>(`SELECT COUNT(*) AS n FROM agent_event WHERE agent_run_id = ?`, [runId]).n;
    await expect(transport.publish(runId, P, 'BIG', { blob: 'x'.repeat(3000) })).rejects.toBeInstanceOf(PayloadTooLargeError);
    const after = adapter.get<any>(`SELECT COUNT(*) AS n FROM agent_event WHERE agent_run_id = ?`, [runId]).n;
    expect(after).toBe(before); // no durability = no emission, no partial row
  });

  it('frame format + Last-Event-ID parsing', () => {
    expect(formatSseFrame({ id: 7, agent_run_id: 'r', type: 'X', payload_json: '{"a":1}', created_at: '' }))
      .toBe('id: 7\nevent: X\ndata: {"a":1}\n\n');
    expect(formatSseFrame({ id: 8, agent_run_id: 'r', type: 'Y', payload_json: null, created_at: '' }))
      .toBe('id: 8\nevent: Y\ndata: null\n\n');
    expect(parseLastEventId('42')).toBe(42);
    expect(parseLastEventId(undefined)).toBe(0);
    expect(parseLastEventId(null)).toBe(0);
    expect(parseLastEventId('abc')).toBe(0);
    expect(parseLastEventId('-3')).toBe(0);
  });

  it('Last-Event-ID replay returns exactly the later sequence (AC)', async () => {
    for (let i = 0; i < 5; i++) await transport.publish(runId, P, 'STEP_STATUS', { step: i });
    // seed: STATE_TRANSITION (1) + RUN_STARTED (2); publishes are 3..7
    const all = await transport.replay(runId, 0);
    expect(frameIds(all)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const later = await transport.replay(runId, 3);
    expect(frameIds(later)).toEqual([4, 5, 6, 7]);
    expect(await transport.replay(runId, 3)).toEqual(later); // deterministic replay
    expect(await transport.cursor(runId)).toBe(7);
  });

  it('reconnect: 0 duplicates, 0 missing across a disconnect', async () => {
    for (let i = 0; i < 5; i++) await transport.publish(runId, P, 'TOOL_EXECUTED', { executionId: `x${i}` });
    const delivered = await transport.replay(runId, 0);
    const firstConnection = delivered.slice(0, 3); // client saw ids 1..3, then dropped
    const lastSeen = frameIds(firstConnection).at(-1)!;
    const reconnected = await transport.replay(runId, parseLastEventId(String(lastSeen)));
    const combined = [...firstConnection, ...reconnected];
    const ids = frameIds(combined);
    expect(new Set(ids).size).toBe(ids.length); // 0 duplicates
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7]); // 0 missing, order preserved
  });

  it('gap in the durable log → SseGapError (fail loud, never silent loss)', async () => {
    for (let i = 0; i < 4; i++) await transport.publish(runId, P, 'STEP_STATUS', { step: i });
    await adapter.runAsync(`DELETE FROM agent_event WHERE id = 3`);
    await expect(transport.replay(runId, 0)).rejects.toBeInstanceOf(SseGapError);
    await expect(transport.replay(runId, 0)).rejects.toThrow(/missing event ids \[3\]/);
  });

  it('retention policy: env-configurable, prunes oldest prefix, replay stays gapless', async () => {
    // config resolution
    expect(resolveRetentionPolicy({} as any)).toEqual(DEFAULT_RETENTION_POLICY);
    const custom = resolveRetentionPolicy({
      SSE_EVENT_RETENTION_DAYS: '7',
      SSE_EVENT_RETENTION_MAX_PER_RUN: '100',
    } as any);
    expect(custom).toEqual({ enabled: true, keepDays: 7, maxEventsPerRun: 100 });
    expect(resolveRetentionPolicy({ SSE_EVENT_RETENTION_DISABLED: '1' } as any).enabled).toBe(false);
    // disabled → no-op
    expect(await pruneEventLog(adapter as any, { ...DEFAULT_RETENTION_POLICY, enabled: false })).toBe(0);
    // per-run cap: 2 seed + 8 published = 10 rows; keep newest 4
    for (let i = 0; i < 8; i++) await transport.publish(runId, P, 'STEP_STATUS', { step: i });
    const deleted = await pruneEventLog(adapter as any, { enabled: true, maxEventsPerRun: 4 });
    expect(deleted).toBe(6);
    const remaining = await transport.replay(runId, 0);
    expect(remaining).toHaveLength(4);
    expect(frameIds(remaining)).toEqual([7, 8, 9, 10]); // newest prefix kept
    // age-based: backdate the oldest remaining rows → pruned, still contiguous
    await adapter.runAsync(`UPDATE agent_event SET created_at = '2020-01-01 00:00:00' WHERE id IN (7, 8)`);
    const ageDeleted = await pruneEventLog(
      adapter as any,
      { enabled: true, keepDays: 30 },
      new Date('2026-11-09T00:00:00Z'),
    );
    expect(ageDeleted).toBe(2);
    expect(frameIds(await transport.replay(runId, 0))).toEqual([9, 10]);
  });

  it('integration: transitions/tools/evidence/approvals all replay in durable order', async () => {
    const svc = new AgentPersistenceService(adapter as any);
    await svc.transition(runId, P, 'RUNNING', 'WAITING_APPROVAL', 'approval gate');
    await svc.recordToolExecution(runId, P, null, 'read_file', { pathRef: 'src/a.ts' });
    await svc.recordEvidence(runId, P, 'S1', 'where is auth', ['ch1'], 0.8);
    const approvalId = await svc.requestApproval(runId, P, 'write_file', 'src/a.ts');
    await svc.decideApproval(approvalId, runId, P, 'APPROVED', 'reviewer1');

    const state = await loadRunState(adapter as any, runId);
    const types = state.events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining([
      'STATE_TRANSITION', 'TOOL_EXECUTED', 'RETRIEVAL_EVIDENCE', 'APPROVAL_REQUESTED', 'APPROVAL_DECIDED',
    ]));
    // agent_state_transition table ↔ STATE_TRANSITION events, same order
    const transitionPayloads = (await transport.replay(runId, 0))
      .map(frameData)
      .filter((d) => d && typeof d === 'object' && 'oldState' in d);
    expect(transitionPayloads.map((d) => `${d.oldState}→${d.newState}`))
      .toEqual(['CREATED→RUNNING', 'RUNNING→WAITING_APPROVAL']);
    expect(transitionPayloads).toHaveLength(state.transitions.length);
    // the SSE replay carries the full durable sequence, in id order
    expect(frameIds(await transport.replay(runId, 0))).toEqual(state.events.map((e) => e.id));
  });
});
