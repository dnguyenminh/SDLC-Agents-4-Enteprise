/**
 * PegaBfsIndexer — BFS loop: fetch rules → ingest → enqueue discovered relatives.
 * SA4E-156: Replaces PegaProjectIndexer.run() with schema-driven relative discovery.
 * Pattern: Facade — orchestrates fetch, ingest, and queue management in one cohesive loop.
 */

import * as vscode from "vscode";
import type { CrawlPlanItem } from "../../models";
import type { UnresolvedDependency } from "../DependencyMapper";
import type { MembershipSet } from "../DiskBackedSet";
import { saveRuleFile, calibrateFetchConcurrency } from "../PegaCrawlHelper";
import { IngestAuthError } from "../PegaStreamIngester";
import { PegaBfsPipeline, type FetchedRule, type BfsRunResult } from "../PegaBfsPipeline";
import { PegaLocalRuleIndex } from "../PegaLocalRuleIndex";
import { MAX_QUEUE_SIZE, MIN_BFS_ITERATIONS, readPipelineConfig } from "./config";
import { readPegaAppName, ruleFilePath } from "./workspace-files";
import { logIngestCrash, logIngestRejection } from "./ingest-log";
import type { BfsIndexResult, PipelineTuning, ProgressReporter } from "./types";
import { PegaBfsIndexerBase } from "./base";

export class PegaBfsIndexer extends PegaBfsIndexerBase {
  /**
   * Run BFS indexing loop until queue is empty.
   * Calibrates fetch concurrency first (BR-13), then processes batches.
   * @param projectId - 12-char hex project identifier
   * @param fetchQueue - Mutable array (FIFO) of rules to fetch
   * @param dedupSet - Mutable set of seen dedup keys
   * @param report - VS Code progress reporter
   * @param root - Workspace root for saving rule files
   * @returns Summary with counts
   */
  async run(
    projectId: string,
    fetchQueue: CrawlPlanItem[],
    dedupSet: MembershipSet,
    report: ProgressReporter,
    root: string,
  ): Promise<BfsIndexResult> {
    const initialCount = fetchQueue.length;
    // SA4E-338 B1: resolve the app name from pega-project.json once per run.
    this.appName = readPegaAppName(root);
    // SA4E-362 FR-3/BR-6: reset auth state đầu mỗi run.
    this.authDead = false;
    this.authNotified = false;
    // Local skip source: records every rule that lands in the backend so the
    // next catalog run can skip it without touching the network.
    this.localIndex = new PegaLocalRuleIndex(root);
    // Effective cap scales with the seed count so a full catalog is never truncated.
    // Seeds + MAX_QUEUE_SIZE covers all seeds plus the relatives the queue can hold.
    const maxIterations = Math.max(MIN_BFS_ITERATIONS, initialCount + MAX_QUEUE_SIZE);
    const counters = { totalIngested: 0, discoveredCount: 0, skippedCount: 0, errorCount: 0 };

    // Read tuning from settings at run start so Settings-UI edits apply to the next
    // index run without a window reload (effect-on-next-run semantics).
    const tuning = readPipelineConfig();

    // BR-13: Calibrate fetch concurrency before the crawl starts.
    await calibrateFetchConcurrency(this.pegaClient, initialCount, this.log);
    this.log(`[BfsIndexer] 🚀 Starting BFS pipeline: ${initialCount} seeds (max iterations: ${maxIterations}) | batch=${tuning.fetchBatchSize}, ingestConcurrency=${tuning.ingestConcurrency}, channelCapacity=${tuning.channelCapacity}`);

    const pipeline = this.createPipeline(projectId, root, tuning, maxIterations, report);

    let runResult: BfsRunResult;
    try {
      runResult = await pipeline.run(fetchQueue, dedupSet, counters);
    } finally {
      this.localIndex?.flush();
    }

    this.logRunSummary(runResult, counters);
    return { ...counters, initialCount, stopReason: runResult.stopReason };
  }

  /**
   * Producer-consumer pipeline: the supplier fetches while N consumers ingest,
   * so network + CPU stay busy instead of idling on serial round-trips. The
   * ingest itself (the slow part) is injected here; queue/dedup mutation stays
   * serial inside the pipeline (DiskBackedSet is not concurrency-safe).
   */
  private createPipeline(
    projectId: string, root: string, tuning: PipelineTuning,
    maxIterations: number, report: ProgressReporter,
  ): PegaBfsPipeline {
    return new PegaBfsPipeline(
      this.pegaClient,
      this.log,
      {
        fetchBatchSize: tuning.fetchBatchSize,
        ingestConcurrency: tuning.ingestConcurrency,
        channelCapacity: tuning.channelCapacity,
        maxQueueSize: MAX_QUEUE_SIZE,
        maxIterations,
        resilient: this.resilient,
        shouldStop: () => (this.authDead ? ("auth" as const) : null), // SA4E-362 FR-4 + SEC-01: literal 'auth'
      },
      (fetched: FetchedRule) => this.ingestOne(projectId, fetched, root),
      (processed, queued) => report.report({
        message: `BFS: fetching ${processed}/${processed + queued} (queue: ${queued})`,
      }),
    );
  }

  private logRunSummary(
    runResult: BfsRunResult,
    counters: { totalIngested: number; discoveredCount: number; skippedCount: number; errorCount: number },
  ): void {
    if (runResult.stopReason) {
      this.log(`[BfsIndexer] ⏸️ BFS paused (${runResult.stopReason}) — ingested=${counters.totalIngested} trước khi dừng, state preserved`);
    }
    this.log(`[BfsIndexer] ✅ BFS complete: ingested=${counters.totalIngested}, discovered=${counters.discoveredCount}, errors=${counters.errorCount}`);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  /**
   * Ingest one fetched rule: save to disk, POST to backend, fire schema hook.
   * Called concurrently by the pipeline consumers — must stay free of shared-state
   * mutation (queue/dedup/counters are handled serially inside the pipeline).
   */
  private async ingestOne(
    projectId: string,
    fetched: FetchedRule,
    root: string,
  ): Promise<{ ingested: boolean; relatives: UnresolvedDependency[] }> {
    const { ruleObj, item } = fetched;
    const file = ruleFilePath(root, ruleObj, item.pxObjClass, item.pyRuleName);
    saveRuleFile(ruleObj, root, this.log, item.pxObjClass, item.pyRuleName);
    // SA4E-241: carry the catalog-resolved checksum (computePegaChecksum, NT-2)
    // through to ingest so the STORED content_hash equals the value bulk-check
    // compares against (INV-1). Without this the stored hash would diverge and
    // no-change skip would never trigger for Pega rules.
    const checksum = item.checksum ?? this.computeChecksum(ruleObj);
    const result = await this.ingestAndDiscover(projectId, ruleObj, checksum, file);
    // Only a rule that actually LANDED in the backend enters the local index —
    // a failed ingest must stay eligible for retry on the next run.
    if (result.ingested && this.localIndex) {
      this.localIndex.record(item.insKey, file, checksum);
    }
    // SA4E-214: Hook schema creation/validation (async, non-blocking).
    this.triggerSchemaHook(item.pxObjClass, ruleObj);
    return result;
  }

  /**
   * Ingest one rule and return ingestion status + relatives.
   * @param presetChecksum - Catalog-resolved checksum (Source A). When absent
   *   (relatives discovered outside the catalog — Source B), it is computed from
   *   the rule's 3 basic fields via the SAME formula (INV-1), never full-JSON.
   */
  private async ingestAndDiscover(
    projectId: string,
    ruleJson: Record<string, unknown>,
    presetChecksum?: string,
    sourceFile?: string,
  ): Promise<{ ingested: boolean; relatives: UnresolvedDependency[] }> {
    try {
      const checksum = presetChecksum ?? this.computeChecksum(ruleJson);
      const version = (ruleJson.pyRuleSetVersion as string) || undefined;

      const result = await this.ingester.ingestSingleRule(projectId, ruleJson, checksum, version, this.appName);
      const ingested = result.status === 'success' && result.ruleId !== undefined && result.ruleId !== -1;
      if (!ingested) {
        logIngestRejection(this.log, result, ruleJson, sourceFile);
      }
      return { ingested, relatives: result.unresolvedDependencies || [] };
    } catch (err: any) {
      return this.handleIngestError(err, ruleJson, sourceFile);
    }
  }

  /** SA4E-362 FR-3/BR-6 — auth failure stops the pipeline; notify exactly once per run. */
  private handleIngestError(
    err: any, ruleJson: Record<string, unknown>, sourceFile?: string,
  ): { ingested: boolean; relatives: UnresolvedDependency[] } {
    // SA4E-362 FR-3: typed auth error — nhận diện bằng instanceof (CẤM regex message).
    if (err instanceof IngestAuthError) {
      this.authDead = true; // idempotent — N consumer set lại không đổi hành vi (AF-1)
      if (!this.authNotified) {
        this.authNotified = true; // BR-6: đúng 1 log + 1 notification per run
        this.log(`[Pega Ingester] ⛔ Auth hết hạn và refresh thất bại — dừng ingest. Hãy login lại rồi chạy lại (state đã preserve)`);
        void vscode.window.showWarningMessage(
          `⛔ Auth hết hạn và refresh thất bại — dừng ingest. Hãy login lại rồi chạy lại (state đã preserve).`,
        );
      }
      // Rule hiện tại vẫn return { ingested: false } — GIỮ ELIGIBLE cho run sau
      // (rerun incremental; đúng comment hiện có). KHÔNG auto-login (BR-3).
      return { ingested: false, relatives: [] };
    }
    logIngestCrash(this.log, err, ruleJson, sourceFile);
    return { ingested: false, relatives: [] };
  }
}
