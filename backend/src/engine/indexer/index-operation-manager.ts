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
 * Facade (BR-18): store ops in index-operation-store.ts, formatting in
 * index-operation-format.ts.
 */

import pino from 'pino';
import type { IndexingEngine } from './indexing-engine.js';
import type { IndexScope } from './index-scope.js';
import type { ProgressPhase, ProgressEvent } from './types.js';
import { IndexOperationRepository } from '../../database/repositories/IndexOperationRepository.js';
import {
  createOp, hydrateFromDb as hydrateImpl, updateProgress as updateProgressImpl,
  compositeKey, CLEANUP_DELAY_MS, type IndexOperation,
} from './index-operation-store.js';
import { formatHot, formatCold, idleProgress } from './index-operation-format.js';

const logger = pino({ name: 'index-operation-manager' });

/** Result of startOrReplace — surfaces whether a previous op was cancelled. */
export interface StartResult {
  operation: IndexOperation;
  cancelledPrevious: boolean;
  cancelledOperationId?: string;
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

    const op = createOp(this.operations, this.opRepo, this.engine, userId, projectId, scope);
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
    if (op) return formatHot(op);

    // Cold-path: survives backend restart (EF-04).
    try {
      const rec = await this.opRepo.findActive(userId, projectId);
      if (rec) return formatCold(rec);
    } catch (err) {
      logger.warn({ err, userId, projectId }, '[index-op] cold-path read failed');
    }
    return idleProgress() as ProgressEvent;
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

  /** Load interrupted operations from DB after restart (see index-operation-store.ts). */
  async hydrateFromDb(): Promise<void> {
    return hydrateImpl(this.operations, this.opRepo);
  }

  // ---- Internal ------------------------------------------------------------

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
    updateProgressImpl(this.operations, this.opRepo, userId, projectId, phase, current, total, currentFile, skipped);
  }
}

