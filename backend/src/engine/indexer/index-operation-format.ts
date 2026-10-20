/** Index operation progress formatting (BR-18 extraction from index-operation-manager). */
import type { ProgressPhase, OperationStatus, ProgressEvent, ChecksumStats } from './types.js';

interface HotOp {
  operationId: string;
  status: OperationStatus;
  phase: ProgressPhase;
  current: number;
  total: number;
  currentFile?: string;
  startedAt: Date;
  checksumStats: { files_skipped: number; files_processed: number; files_pending: number };
  error?: { message: string; stack?: string; phase?: ProgressPhase; file?: string };
}

export function formatHot(op: HotOp): ProgressEvent {
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

export function formatCold(rec: {
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

export function idleProgress(): ProgressEvent {
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
