/**
 * PegaBfsIndexer — shared types for the BFS indexer modules.
 */

import type * as vscode from "vscode";

/** Summary returned after BFS completes */
export interface BfsIndexResult {
  totalIngested: number;
  initialCount: number;
  discoveredCount: number;
  skippedCount: number;
  errorCount: number;
  /** SA4E-362 FR-4 + SEC-01 (3.7): lý do dừng sớm — chỉ 'auth' (literal union); null/undefined = chạy hết bình thường. */
  stopReason?: "auth" | null;
}

/** Effective pipeline tuning resolved from settings for one run. */
export interface PipelineTuning {
  fetchBatchSize: number;
  ingestConcurrency: number;
  channelCapacity: number;
}

export type ProgressReporter = vscode.Progress<{ message?: string }>;
export type LogFn = (msg: string) => void;
