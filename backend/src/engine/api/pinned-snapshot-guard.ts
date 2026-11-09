/**
 * SA4E-426 — API-level pinned snapshot enforcement (16K Doc §17 + §11).
 *
 * Every chat/search request MUST carry BOTH the session and its pinned
 * `index_snapshot_id`. The guard rejects (400) when the id is missing, when the
 * snapshot is not the one pinned at session start, or when the snapshot is not
 * READY / not owned by the session repository. `branch` is display metadata
 * only — it is echoed back but NEVER used for snapshot resolution, so a branch
 * head move cannot drift an in-flight conversation.
 *
 * Usage (Hono):
 *   api.use('/agent/chat', pinnedSnapshotGuard(db, retrieval));
 *   api.post('/agent/search', pinnedSnapshotGuard(db, retrieval), handler);
 *   handler reads c.get('pinned') + c.get('pinnedBody').
 */

import type { Context, Next } from 'hono';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { SnapshotRetrievalService } from '../retrieval/snapshot-retrieval.js';

export type PinErrorCode =
  | 'SESSION_ID_REQUIRED'
  | 'SNAPSHOT_ID_REQUIRED'
  | 'SESSION_NOT_FOUND'
  | 'SNAPSHOT_MISMATCH'
  | 'SNAPSHOT_COMMIT_MISMATCH'
  | 'SNAPSHOT_NOT_FOUND'
  | 'SNAPSHOT_NOT_READY'
  | 'SNAPSHOT_REPOSITORY_MISMATCH';

/** Thrown for every validation failure; the middleware maps it to HTTP 400. */
export class PinValidationError extends Error {
  readonly status = 400 as const;
  constructor(
    readonly code: PinErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PinValidationError';
  }
}

export interface PinnedRequestInput {
  session_id?: unknown;
  index_snapshot_id?: unknown;
  /** Display metadata only — never used for snapshot resolution. */
  branch?: unknown;
}

export interface PinnedContext {
  sessionId: string;
  repositoryId: string;
  commitId: string;
  indexSnapshotId: string;
  /** Echo of the optional display branch (does not affect resolution). */
  branch: string | null;
}

export type PinnedApiEnv = {
  Variables: {
    pinned: PinnedContext;
    pinnedBody: Record<string, unknown>;
  };
};

function requiredString(value: unknown, code: PinErrorCode, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PinValidationError(code, `${field} is required`);
  }
  return value.trim();
}

/** Map SnapshotRetrievalService pin errors onto API validation errors (400). */
function mapPinError(err: unknown): PinValidationError {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith('SNAPSHOT_NOT_FOUND')) return new PinValidationError('SNAPSHOT_NOT_FOUND', message);
  if (message.startsWith('SNAPSHOT_NOT_READY')) return new PinValidationError('SNAPSHOT_NOT_READY', message);
  if (message.startsWith('SNAPSHOT_REPOSITORY_MISMATCH')) {
    return new PinValidationError('SNAPSHOT_REPOSITORY_MISMATCH', message);
  }
  return new PinValidationError('SNAPSHOT_NOT_FOUND', message);
}

interface SessionPinRow {
  id: string;
  repository_id: string;
  commit_id: string;
  pinned_code_index_snapshot_id: string;
}

/**
 * Resolve + validate the session pin against the request snapshot. Throws
 * PinValidationError (400) on any mismatch; never falls back to branch head.
 */
export async function resolvePinnedContext(
  db: QueryDatabaseAdapter,
  retrieval: SnapshotRetrievalService,
  input: PinnedRequestInput | null | undefined,
): Promise<PinnedContext> {
  const sessionId = requiredString(input?.session_id, 'SESSION_ID_REQUIRED', 'session_id');
  const indexSnapshotId = requiredString(input?.index_snapshot_id, 'SNAPSHOT_ID_REQUIRED', 'index_snapshot_id');

  const session = await db.getAsync<SessionPinRow>(
    `SELECT id, repository_id, commit_id, pinned_code_index_snapshot_id
     FROM chat_session WHERE id = ?`,
    [sessionId],
  );
  if (!session) throw new PinValidationError('SESSION_NOT_FOUND', `session ${sessionId} not found`);
  if (session.pinned_code_index_snapshot_id !== indexSnapshotId) {
    throw new PinValidationError(
      'SNAPSHOT_MISMATCH',
      `index_snapshot_id ${indexSnapshotId} is not the session pin ${session.pinned_code_index_snapshot_id}`,
    );
  }

  let info;
  try {
    info = await retrieval.pinOrThrow(indexSnapshotId, session.repository_id);
  } catch (err) {
    throw mapPinError(err);
  }
  if (info.commitId !== session.commit_id) {
    throw new PinValidationError(
      'SNAPSHOT_COMMIT_MISMATCH',
      `snapshot ${indexSnapshotId} is on commit ${info.commitId}, session pinned ${session.commit_id}`,
    );
  }
  return {
    sessionId,
    repositoryId: session.repository_id,
    commitId: session.commit_id,
    indexSnapshotId,
    branch: typeof input?.branch === 'string' ? input.branch : null,
  };
}

/** Hono middleware: validates the JSON body, sets `pinned` + `pinnedBody`. */
export function pinnedSnapshotGuard(db: QueryDatabaseAdapter, retrieval: SnapshotRetrievalService) {
  return async (c: Context<PinnedApiEnv>, next: Next): Promise<Response | void> => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ data: null, error: { code: 'INVALID_BODY', message: 'JSON object body required' } }, 400);
    }
    try {
      c.set('pinned', await resolvePinnedContext(db, retrieval, body));
      c.set('pinnedBody', body);
    } catch (err) {
      if (err instanceof PinValidationError) {
        return c.json({ data: null, error: { code: err.code, message: err.message } }, 400);
      }
      throw err;
    }
    await next();
  };
}
