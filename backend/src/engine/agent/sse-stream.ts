/**
 * SA4E-425 — SSE transport over the durable agent event log (16K Doc §15/§17).
 *
 * Ordering guarantee: the durable row ALWAYS commits before a frame is handed
 * to the transport — publish() appends first, then reads back the row. A
 * crashed stream can therefore never emit an event that a replay misses.
 *
 * Reconnect (AC #16): replay(runId, Last-Event-ID) validates contiguity first
 * and refuses a gapped sequence (SseGapError) instead of silently losing
 * events. Contiguity + `id > cursor` ordering yields exactly-once delivery.
 *
 * Retention: prunes the OLDEST prefix (age and/or per-run cap), so remaining
 * ids stay consecutive and future replays remain gapless.
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';
import { AgentEventLog, type AgentEventRow } from './agent-event-log.js';
import { verifyEventContiguity } from './agent-state-recovery.js';

const logger = pino({ name: 'sse-stream' });

export const LAST_EVENT_ID_HEADER = 'last-event-id';

export class SseGapError extends Error {
  constructor(
    readonly runId: string,
    readonly gaps: number[],
  ) {
    super(`SSE_GAP: run ${runId} has missing event ids [${gaps.join(',')}] — refusing replay (fail loud)`);
    this.name = 'SseGapError';
  }
}

/** Last-Event-ID header → cursor (absent/invalid = 0 = full replay). */
export function parseLastEventId(header: string | null | undefined): number {
  const cursor = Number.parseInt(header ?? '', 10);
  return Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
}

/** One SSE frame: id (cursor) + named event + single-line JSON data + blank. */
export function formatSseFrame(event: AgentEventRow): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${event.payload_json ?? 'null'}\n\n`;
}

export class SseEventTransport {
  readonly log: AgentEventLog;

  constructor(
    private readonly db: QueryDatabaseAdapter,
    log?: AgentEventLog,
  ) {
    this.log = log ?? new AgentEventLog(db);
  }

  /** Durable-before-publish: append commits, then the frame is returned. */
  async publish(runId: string, projectId: string, type: string, payload?: unknown): Promise<string> {
    const id = await this.log.append(runId, projectId, type, payload);
    const rows = await this.log.replay(runId, id - 1);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`SSE_PUBLISH_RACE: event ${id} not readable after durable append`);
    logger.debug({ runId, id, type }, '[sse] durable event published');
    return formatSseFrame(row);
  }

  /** Reconnect replay: every event after lastEventId, exactly once, in order. */
  async replay(runId: string, lastEventId = 0): Promise<string[]> {
    const report = await verifyEventContiguity(this.db, runId);
    if (!report.contiguous) throw new SseGapError(runId, report.gaps);
    const rows = await this.log.replay(runId, lastEventId);
    return rows.map(formatSseFrame);
  }

  /** Cursor for the client's next reconnect (Last-Event-ID value). */
  async cursor(runId: string): Promise<number> {
    const report = await verifyEventContiguity(this.db, runId);
    return report.lastId ?? 0;
  }
}

export interface RetentionPolicy {
  enabled: boolean;
  /** Delete events older than this many days (oldest prefix per run). */
  keepDays?: number;
  /** Per-run cap: keep only the newest N events. */
  maxEventsPerRun?: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  enabled: true,
  keepDays: 30,
  maxEventsPerRun: 50_000,
};

/** Env overrides make the policy deploy-time configurable. */
export function resolveRetentionPolicy(env: NodeJS.ProcessEnv = process.env): RetentionPolicy {
  const days = Number.parseInt(env.SSE_EVENT_RETENTION_DAYS ?? '', 10);
  const max = Number.parseInt(env.SSE_EVENT_RETENTION_MAX_PER_RUN ?? '', 10);
  return {
    enabled: env.SSE_EVENT_RETENTION_DISABLED !== '1',
    keepDays: Number.isFinite(days) && days >= 0 ? days : DEFAULT_RETENTION_POLICY.keepDays,
    maxEventsPerRun: Number.isFinite(max) && max > 0 ? max : DEFAULT_RETENTION_POLICY.maxEventsPerRun,
  };
}

/** Prune the oldest prefix — remaining ids stay contiguous for replay. */
export async function pruneEventLog(
  db: QueryDatabaseAdapter,
  policy: RetentionPolicy,
  now = new Date(),
): Promise<number> {
  if (!policy.enabled) return 0;
  let deleted = 0;
  if (policy.keepDays !== undefined) {
    const cutoff = new Date(now.getTime() - policy.keepDays * 86_400_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' '); // match SQLite datetime('now') format
    deleted += (await db.runAsync(`DELETE FROM agent_event WHERE created_at < ?`, [cutoff])).changes;
  }
  if (policy.maxEventsPerRun !== undefined) {
    const runs = await db.allAsync<{ agent_run_id: string }>(`SELECT DISTINCT agent_run_id FROM agent_event`);
    for (const { agent_run_id: runId } of runs) {
      const keepFrom = await db.getAsync<{ id: number }>(
        `SELECT id FROM agent_event WHERE agent_run_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?`,
        [runId, policy.maxEventsPerRun - 1],
      );
      if (!keepFrom) continue; // fewer events than the cap
      deleted += (await db.runAsync(
        `DELETE FROM agent_event WHERE agent_run_id = ? AND id < ?`,
        [runId, keepFrom.id],
      )).changes;
    }
  }
  if (deleted > 0) logger.info({ deleted }, '[sse] retention pruned oldest prefix');
  return deleted;
}
