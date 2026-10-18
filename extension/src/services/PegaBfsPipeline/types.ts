/**
 * Shared type contracts for the Pega BFS pipeline (SA4E-92, SA4E-362).
 */

import type { CrawlPlanItem } from "../../models";
import type { UnresolvedDependency } from "../DependencyMapper";

export type LogFn = (msg: string) => void;

/** A rule fetched from Pega, awaiting ingest. */
export interface FetchedRule {
  ruleObj: Record<string, unknown>;
  item: CrawlPlanItem;
}

/** Mutable counters threaded through the whole run. */
export interface BfsCounters {
  totalIngested: number;
  discoveredCount: number;
  skippedCount: number;
  errorCount: number;
}

/** Callback that ingests one fetched rule and reports status + discovered relatives. */
export type IngestFn = (rule: FetchedRule) => Promise<{ ingested: boolean; relatives: UnresolvedDependency[] }>;

/** Progress callback invoked (best-effort) as rules are drained. */
export type ProgressFn = (processed: number, queued: number) => void;

/** Tunables for the pipeline run. */
export interface PipelineOptions {
  fetchBatchSize: number;
  ingestConcurrency: number;
  channelCapacity: number;
  maxQueueSize: number;
  maxIterations: number;
  resilient: boolean;
  /** SA4E-362 FR-4 + SEC-01 (3.7): stop-hook nghiệp vụ. Trả lý do dừng (literal — chỉ 'auth' hôm nay)
   *  hoặc null = chạy tiếp. Được check tại supply() loop-top + consume() đầu vòng. KHÔNG liên quan `aborted`. */
  shouldStop?: () => "auth" | null;
}

/** SA4E-362 FR-4 + SEC-01 (3.7): kết quả run(). Counters được fill bình thường qua parameter (non-breaking
 *  với caller cũ bỏ qua return); result chỉ bổ sung stopReason (literal union — không chuỗi tự do). */
export interface BfsRunResult {
  stopReason: "auth" | null;
}
