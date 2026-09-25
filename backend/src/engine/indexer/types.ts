/**
 * SA4E-78 / SA4E-101 — Indexer type definitions for decoupled architecture.
 * Shared interfaces for file events, progress tracking, and operation management.
 */

/** File event pushed from Extension-driven file watching. */
export interface FileEvent {
  /** Event type: add = new file, change = modified, delete = removed */
  type: 'add' | 'change' | 'delete';
  /** Relative path within workspace */
  path: string;
  /** File content for add/change (optional — if absent, file must exist on disk) */
  content?: string;
  /** SHA-256 prefix for skip-if-unchanged optimization */
  contentHash?: string;
}

/** Progress phases during a full index operation lifecycle. */
export type ProgressPhase =
  | 'idle'
  | 'scanning'
  | 'indexing'
  | 'resolving'
  | 'complete'
  | 'cancelled'
  | 'error';

/**
 * Runtime status of a tracked index operation.
 * SA4E-101 extends with `interrupted` (backend restart mid-run) and
 * `superseded` (auto-cancelled by a newer run per BR-11).
 */
export type OperationStatus =
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'superseded';

/** Checksum-based skip statistics (SA4E-101, UC-07). */
export interface ChecksumStats {
  files_skipped: number;
  files_processed: number;
  files_pending: number;
}

/** Progress snapshot emitted at batch boundaries / returned by the progress API. */
export interface ProgressEvent {
  operationId: string;
  /** Runtime status of the operation; `idle` is only returned by the API when no op exists. */
  status: OperationStatus | 'idle';
  phase: ProgressPhase;
  current: number;
  total: number;
  percentage: number;
  message?: string;
  currentFile?: string;
  startedAt: string;
  updatedAt?: string;
  elapsedMs: number;
  /** Checksum skip stats (nullable on cold-path fallback). */
  checksumStats: ChecksumStats | null;
  error?: {
    message: string;
    stack?: string;
    phase?: ProgressPhase;
    file?: string;
  };
}

/** Result summary returned from the file-events endpoint. */
export interface FileEventsResult {
  indexed: number;
  updated: number;
  removed: number;
  skipped: number;
  rejected: string[];
  projectId: string;
}
