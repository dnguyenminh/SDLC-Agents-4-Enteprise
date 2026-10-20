/**
 * Index operation store operations (BR-18 extraction from index-operation-manager).
 * createOp / hydrateFromDb / updateProgress operate on the shared in-memory Map
 * + the cold-path IndexOperationRepository.
 */
import { randomUUID } from 'crypto';
import pino from 'pino';
import type { IndexingEngine } from './indexing-engine.js';
import type { IndexScope } from './index-scope.js';
import type { ProgressPhase, OperationStatus } from './types.js';
import { IndexOperationRepository } from '../../database/repositories/IndexOperationRepository.js';

const logger = pino({ name: 'index-operation-manager' });

/** In-memory cache cleanup delay after an operation terminates (ms). */
export const CLEANUP_DELAY_MS = 60_000;

export interface IndexOperation {
  operationId: string;
  userId: string;
  projectId: string;
  status: OperationStatus;
  phase: ProgressPhase;
  current: number;
  total: number;
  currentFile?: string;
  startedAt: Date;
  abortController: AbortController;
  checksumStats: { files_skipped: number; files_processed: number; files_pending: number };
  error?: {
    message: string;
    stack?: string;
    phase?: ProgressPhase;
    file?: string;
  };
}

export function compositeKey(userId: string, projectId: string): string {
  return `${userId}:${projectId}`;
}

type OperationsMap = Map<string, IndexOperation>;

/** Create an op, persist it fire-and-forget, and launch the background full index. */
export function createOp(
  operations: OperationsMap, opRepo: IndexOperationRepository, engine: IndexingEngine,
  userId: string, projectId: string, scope: IndexScope,
): IndexOperation {
  const key = compositeKey(userId, projectId);
  const op: IndexOperation = {
    operationId: `idx-${randomUUID().slice(0, 8)}`,
    userId,
    projectId,
    status: 'running',
    phase: 'scanning',
    current: 0,
    total: 0,
    startedAt: new Date(),
    abortController: new AbortController(),
    checksumStats: { files_skipped: 0, files_processed: 0, files_pending: 0 },
  };
  operations.set(key, op);
  persistCreate(opRepo, op, userId, projectId);
  launchFullIndex(operations, opRepo, engine, key, op, scope);
  return op;
}

function persistCreate(opRepo: IndexOperationRepository, op: IndexOperation, userId: string, projectId: string): void {
  // Fire-and-forget DB create (cold-path).
  opRepo
    .create({
      id: op.operationId,
      user_id: userId,
      project_id: projectId,
      status: 'running',
      phase: 'scanning',
      current: 0,
      total: 0,
    })
    .catch((err) =>
      logger.warn({ err, opId: op.operationId }, '[index-op] create persist failed'),
    );
}

/** SA4E-99: engine runs in background; update op state on completion. */
function launchFullIndex(
  operations: OperationsMap, opRepo: IndexOperationRepository, engine: IndexingEngine,
  key: string, op: IndexOperation, scope: IndexScope,
): void {
  engine
    .runFullIndex(scope, op.abortController.signal, op.userId)
    .then(() => {
      op.status = 'completed';
      op.phase = 'complete';
      opRepo.updateStatus(op.operationId, 'completed').catch(() => undefined);
    })
    .catch((err: unknown) => {
      op.status = 'failed';
      op.phase = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      op.error = {
        message: msg,
        stack: err instanceof Error ? err.stack?.split('\n').slice(0,5).join('\n') : undefined,
        phase: op.phase,
        file: op.currentFile,
      };
      logger.error({ err, opId: op.operationId, msg }, '[index-op] full index failed');
      opRepo.updateStatus(op.operationId, 'failed').catch(() => undefined);
    })
    .finally(() => {
      setTimeout(() => operations.delete(key), CLEANUP_DELAY_MS);
    });
}

/**
 * Load interrupted operations from DB after restart so the progress API can
 * surface them until a new index starts or cleanup removes them.
 */
export async function hydrateFromDb(operations: OperationsMap, opRepo: IndexOperationRepository): Promise<void> {
  try {
    const recs = await opRepo.findInterrupted();
    for (const rec of recs) {
      const key = compositeKey(rec.user_id, rec.project_id);
      if (operations.has(key)) continue;
      operations.set(key, {
        operationId: rec.id,
        userId: rec.user_id,
        projectId: rec.project_id,
        status: 'interrupted',
        phase: rec.phase as ProgressPhase,
        current: rec.current,
        total: rec.total,
        startedAt: rec.started_at,
        abortController: new AbortController(),
        checksumStats: { files_skipped: 0, files_processed: 0, files_pending: 0 },
      });
    }
    if (recs.length) {
      logger.info({ count: recs.length }, '[index-op] hydrated interrupted operations from DB');
    }
  } catch (err) {
    logger.warn({ err }, '[index-op] hydrateFromDb failed (non-fatal)');
  }
}

/**
 * Update progress state at batch boundaries and persist to cold-path
 * (fire-and-forget per BR-10).
 */
export function updateProgress(
  operations: OperationsMap, opRepo: IndexOperationRepository,
  userId: string, projectId: string,
  phase: ProgressPhase, current: number, total: number,
  currentFile?: string, skipped?: number,
): void {
  const op = operations.get(compositeKey(userId, projectId));
  if (!op) return;
  op.phase = phase;
  op.current = current;
  op.total = total;
  if (currentFile) op.currentFile = currentFile;
  if (skipped !== undefined) op.checksumStats.files_skipped = skipped;
  op.checksumStats.files_processed = current;
  op.checksumStats.files_pending = Math.max(
    0,
    total - current - op.checksumStats.files_skipped,
  );
  opRepo
    .updateProgress(op.operationId, {
      phase,
      current,
      total,
      current_file: currentFile ?? null,
    })
    .catch(() => undefined);
}
