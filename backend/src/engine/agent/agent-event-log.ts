/**
 * SA4E-416 — Durable agent event log (16K Doc §15).
 *
 * Contract: the durable row is written BEFORE any SSE emission — the SSE layer
 * (SA4E-425) must call append() first, then publish; clients replay via
 * Last-Event-ID (replay(afterEventId)).
 *
 * Payload rule (§15): reference-only JSON — evidence IDs / artifact refs, never
 * full content. assertReferenceOnly() enforces a hard size cap.
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'agent-event-log' });

export const MAX_PAYLOAD_CHARS = 2048;

export class PayloadTooLargeError extends Error {
  constructor(public readonly size: number) {
    super(`PAYLOAD_TOO_LARGE: ${size} > ${MAX_PAYLOAD_CHARS} chars — store a reference, not content (§15)`);
  }
}

/** Serialize + enforce reference-only payloads. Throws PayloadTooLargeError. */
export function assertReferenceOnly(payload: unknown): string {
  const json = JSON.stringify(payload ?? null);
  if (json.length > MAX_PAYLOAD_CHARS) throw new PayloadTooLargeError(json.length);
  return json;
}

export interface AgentEventRow {
  id: number;
  agent_run_id: string;
  type: string;
  payload_json: string | null;
  created_at: string;
}

export class AgentEventLog {
  constructor(private readonly db: QueryDatabaseAdapter) {}

  /** Durable append — call BEFORE publishing the event over SSE. */
  async append(runId: string, projectId: string, type: string, payload?: unknown): Promise<number> {
    const json = payload === undefined ? null : assertReferenceOnly(payload);
    await this.db.runAsync(
      `INSERT INTO agent_event (project_id, agent_run_id, type, payload_json) VALUES (?, ?, ?, ?)`,
      [projectId, runId, type, json],
    );
    const row = await this.db.getAsync<{ id: number }>(
      `SELECT MAX(id) AS id FROM agent_event WHERE agent_run_id = ?`,
      [runId],
    );
    const id = row?.id ?? 0;
    logger.debug({ runId, eventId: id, type }, '[agent-event] appended (durable before publish)');
    return id;
  }

  /** Replay for SSE Last-Event-ID: all events strictly after the given id. */
  async replay(runId: string, afterEventId = 0): Promise<AgentEventRow[]> {
    return this.db.allAsync<AgentEventRow>(
      `SELECT id, agent_run_id, type, payload_json, created_at
       FROM agent_event WHERE agent_run_id = ? AND id > ? ORDER BY id ASC`,
      [runId, afterEventId],
    );
  }
}
