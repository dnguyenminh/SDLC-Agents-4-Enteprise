/**
 * SA4E-101 — IndexOperationManager (SRP: operation lifecycle tracking).
 * Manages active index operations with AbortControllers and progress state.
 * Separated from IndexingEngine so engine focuses on indexing logic only.
 *
 * SA4E-101 extends SA4E-78 with:
 *  - Multi-tenant isolation via composite key `${userId}:${projectId}` (BR-02)
 *  - Dual-path persistence: hot in-memory Map + cold PostgreSQL `index_operations`
 *  - Auto-cancel-and-replace on new index request (BR-11)
 *  - `interrupted` / `superseded` lifecycle states
 */

import { randomUUID } from 'crypto';
import pino from 'pino';
import type { IndexingEngine } from './indexing-engine.js';
import type { IndexScope } from './index-scope.js';
import type { ProgressPhase, OperationStatus, ProgressEvent, ChecksumStats } from './types.js';
import { IndexOperationRepository } from '../../database/repositories/IndexOperationRepository.js';

const logger = pino({ name: 'index-operation-manager' });

/** In-memory cache cleanup delay after an operation terminates (ms). */
const CLEANUP_DELAY_MS = 60_000;

/** Tracks a single active index operation (hot-path). */
interface IndexOperation {
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
  checksumStats: ChecksumStats;
  error?: {
    message: string;
    stack?: string;
    phase?: ProgressPhase;
    file?: string;
  };
}

/** Result of startOrReplace — surfaces whether a previous op was cancelled. */
export interface StartResult {
  operation: IndexOperation;
  cancelledPrevious: boolean;
  cancelledOperationId?: string;
}

function compositeKey(userId: string, projectId: string): string {
  return `${userId}:${projectId}`;
}

export class IndexOperationManager {
  private operations = new Map<string, IndexOperation>();
  private readonly opRepo: IndexOperationRepository;

  constructor(
    private readonly engine: IndexingEngine,
    opRepo?: IndexOperationRepository,
  ) {
    this.opRepo = opRepo ?? new IndexOperationRepository();
    // Single observer for engine progress events; routes by projectId (hot-path).
    this.engine.on('progress', (evt: any) => this.onEngineProgress(evt));
  }

  // ---- Lifecycle -----------------------------------------------------------

  /**
   * Auto-cancel any existing operation for the tenant and start a new full
   * index (BR-11). Supersedes in-memory and DB-active records so the partial
   * unique index frees up for the new run.
   */
  async startOrReplace(
    userId: string,
    projectId: string,
    scope: IndexScope,
  ): Promise<StartResult> {
    const key = compositeKey(userId, projectId);
    const existing = this.operations.get(key);
    let cancelledPrevious = false;
    let cancelledOperationId: string | undefined;

    if (existing && existing.status === 'running') {
      existing.abortController.abort();
      existing.status = 'superseded';
      cancelledPrevious = true;
      cancelledOperationId = existing.operationId;
      this.opRepo.updateStatus(existing.operationId, 'superseded').catch(() => undefined);
      setTimeout(() => this.operations.delete(key), CLEANUP_DELAY_MS);
    }

    // Finalize any DB-active record left from a prior session/restart.
    try {
      const n = await this.opRepo.supersedeActive(userId, projectId);
      if (n > 0 && !cancelledPrevious) cancelledPrevious = true;
    } catch (err) {
      logger.warn({ err, userId, projectId }, '[index-op] supersedeActive failed (non-fatal)');
    }

    const op = this.createOp(userId, projectId, scope);
    return { operation: op, cancelledPrevious, cancelledOperationId };
  }

  /**
   * Cancel a running index operation via AbortSignal.
   * @returns The cancelled operation, or null if not found/not running.
   */
  cancelOperation(userId: string, projectId: string): IndexOperation | null {
    const op = this.operations.get(compositeKey(userId, projectId));
    if (!op || op.status !== 'running') return null;
    op.abortController.abort();
    op.status = 'cancelled';
    op.phase = 'cancelled';
    this.opRepo.updateStatus(op.operationId, 'cancelled').catch(() => undefined);
    return op;
  }

  // ---- Progress ------------------------------------------------------------

  /**
   * Get current progress snapshot for a tenant.
   * Hot-path (in-memory) first, then cold-path (DB) fallback, else idle.
   */
  async getProgress(userId: string, projectId: string): Promise<ProgressEvent> {
    const op = this.operations.get(compositeKey(userId, projectId));
    if (op) return this.formatHot(op);

    // Cold-path: survives backend restart (EF-04).
    try {
      const rec = await this.opRepo.findActive(userId, projectId);
      if (rec) return this.formatCold(rec);
    } catch (err) {
      logger.warn({ err, userId, projectId }, '[index-op] cold-path read failed');
    }
    return this.idle();
  }

  /** Hot-path lookup (used by route for quick checks). */
  getFromMemory(userId: string, projectId: string): IndexOperation | undefined {
    return this.operations.get(compositeKey(userId, projectId));
  }

  // ---- Persistence helpers -------------------------------------------------

  /**
   * Persist progress to cold-path (fire-and-forget). Called at batch
   * boundaries per BR-10. Safe to call even when DB is unreachable.
   */
  persistProgress(userId: string, projectId: string): void {
    const op = this.operations.get(compositeKey(userId, projectId));
    if (!op) return;
    this.opRepo
      .updateProgress(op.operationId, {
        phase: op.phase,
        current: op.current,
        total: op.total,
        current_file: op.currentFile ?? null,
      })
      .catch(() => undefined);
  }

  /**
   * Load interrupted operations from DB after restart so the progress API can
   * surface them until a new index starts or cleanup removes them.
   */
  async hydrateFromDb(): Promise<void> {
    try {
      const recs = await this.opRepo.findInterrupted();
      for (const rec of recs) {
        const key = compositeKey(rec.user_id, rec.project_id);
        if (this.operations.has(key)) continue;
        this.operations.set(key, {
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

  // ---- Internal ------------------------------------------------------------

  private createOp(userId: string, projectId: string, scope: IndexScope): IndexOperation {
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
    this.operations.set(key, op);

    // Fire-and-forget DB create (cold-path).
    this.opRepo
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

    // SA4E-99: engine runs in background; update op state on completion.
    this.engine
      .runFullIndex(scope, op.abortController.signal, op.userId)
      .then(() => {
        op.status = 'completed';
        op.phase = 'complete';
        this.opRepo.updateStatus(op.operationId, 'completed').catch(() => undefined);
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
        this.opRepo.updateStatus(op.operationId, 'failed').catch(() => undefined);
      })
      .finally(() => {
        setTimeout(() => this.operations.delete(key), CLEANUP_DELAY_MS);
      });

    return op;
  }

  private onEngineProgress(evt: {
    projectId: string;
    phase: ProgressPhase;
    current: number;
    total: number;
    currentFile?: string;
    skipped?: number;
  }): void {
    for (const op of this.operations.values()) {
      if (op.projectId === evt.projectId && op.status === 'running') {
        this.updateProgress(
          op.userId,
          op.projectId,
          evt.phase,
          evt.current,
          evt.total,
          evt.currentFile,
          evt.skipped,
        );
        break; // at most one running op per projectId
      }
    }
  }

  /**
   * Update progress state at batch boundaries and persist to cold-path
   * (fire-and-forget per BR-10).
   */
  updateProgress(
    userId: string,
    projectId: string,
    phase: ProgressPhase,
    current: number,
    total: number,
    currentFile?: string,
    skipped?: number,
  ): void {
    const op = this.operations.get(compositeKey(userId, projectId));
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
    this.opRepo
      .updateProgress(op.operationId, {
        phase,
        current,
        total,
        current_file: currentFile ?? null,
      })
      .catch(() => undefined);
  }

  // ---- Formatting ----------------------------------------------------------

  private formatHot(op: IndexOperation): ProgressEvent {
    const elapsed = Date.now() - op.startedAt.getTime();
    const pct = op.total > 0 ? Math.round((op.current / op.total) * 100) : 0;
    return {
      operationId: op.operationId,
      status: op.status,
      phase: op.phase,
      current: op.current,
      total: op.total,
      percentage: pct,
      currentFile: op.currentFile,
      startedAt: op.startedAt.toISOString(),
      elapsedMs: elapsed,
      checksumStats: op.checksumStats,
      error: op.error,
    };
  }

  private formatCold(rec: {
    id: string;
    status: OperationStatus;
    phase: string;
    current: number;
    total: number;
    started_at: Date;
    updated_at: Date;
  }): ProgressEvent {
    const startedAt = rec.started_at;
    const elapsed = Date.now() - startedAt.getTime();
    const pct = rec.total > 0 ? Math.round((rec.current / rec.total) * 100) : 0;
    return {
      operationId: rec.id,
      status: rec.status,
      phase: rec.phase as ProgressPhase,
      current: rec.current,
      total: rec.total,
      percentage: pct,
      startedAt: startedAt.toISOString(),
      updatedAt: rec.updated_at.toISOString(),
      elapsedMs: elapsed,
      checksumStats: null,
    };
  }

  private idle(): ProgressEvent {
    return {
      operationId: '',
      status: 'idle',
      phase: 'idle',
      current: 0,
      total: 0,
      percentage: 0,
      startedAt: '',
      elapsedMs: 0,
      checksumStats: null,
    };
  }
}
