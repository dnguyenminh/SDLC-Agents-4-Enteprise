/**
 * PegaBfsIndexer — BFS loop: fetch rules → ingest → enqueue discovered relatives.
 * SA4E-156: Replaces PegaProjectIndexer.run() with schema-driven relative discovery.
 * Pattern: Facade — orchestrates fetch, ingest, and queue management in one cohesive loop.
 */

import * as vscode from "vscode";
import type { CrawlPlanItem } from "../models";
import { computePegaChecksum } from "../code-intel/checksum/PegaRuleChecksumStrategy";
import type { PegaHttpClient } from "./PegaHttpClient";
import type { ISchemaOrchestrator } from "./PegaSchemaOrchestrator";
import { fetchRulesInParallel, saveRuleFile, calibrateFetchConcurrency } from "./PegaCrawlHelper";
import { PegaStreamIngester } from "./PegaStreamIngester";
import { DependencyMapper } from "./DependencyMapper";
import type { UnresolvedDependency } from "./DependencyMapper";
import type { MembershipSet } from "./DiskBackedSet";

type ProgressReporter = vscode.Progress<{ message?: string }>;
type LogFn = (msg: string) => void;

/** BFS batch size — rules fetched per iteration */
const BATCH_SIZE = 50;

/**
 * Floor for the max-iteration guard (CWE-400 mitigation). The effective cap is
 * computed per run as seeds + MAX_QUEUE_SIZE so an authoritative catalog list
 * (e.g. 17,978 rules) is never truncated, while still bounding runaway crawls.
 */
const MIN_BFS_ITERATIONS = 10_000;

/** Maximum queue size before BFS stops enqueueing new relatives (CWE-400 mitigation) */
const MAX_QUEUE_SIZE = 50_000;

/** Summary returned after BFS completes */
export interface BfsIndexResult {
  totalIngested: number;
  initialCount: number;
  discoveredCount: number;
  skippedCount: number;
  errorCount: number;
}

/**
 * BFS-driven indexer: fetches rules from Pega, ingests into backend,
 * and enqueues newly-discovered relatives until queue is empty.
 * SA4E-214: Hooks schema creation on first-encounter rule types + progressive validation.
 */
export class PegaBfsIndexer {
  private readonly ingester: PegaStreamIngester;
  /** SA4E-214: Track rule types already seen this session for schema creation */
  private readonly seenRuleTypes = new Set<string>();

  /**
   * @param resilient - When true, a per-rule 5xx does NOT abort the whole run.
   *   Used by catalog-sourced indexing where the rule list is authoritative and a
   *   single failing rule must not discard the remaining thousands.
   */
  constructor(
    private readonly pegaClient: PegaHttpClient,
    private readonly backendUrl: string,
    private readonly outputChannel: vscode.OutputChannel | undefined,
    private readonly log: LogFn,
    private readonly schemaOrchestrator?: ISchemaOrchestrator,
    private readonly resilient = false,
  ) {
    this.ingester = new PegaStreamIngester(backendUrl);
  }

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
    // Effective cap scales with the seed count so a full catalog is never truncated.
    // Seeds + MAX_QUEUE_SIZE covers all seeds plus the relatives the queue can hold.
    const maxIterations = Math.max(MIN_BFS_ITERATIONS, initialCount + MAX_QUEUE_SIZE);
    const counters = { totalIngested: 0, discoveredCount: 0, skippedCount: 0, errorCount: 0 };
    let processed = 0;

    // BR-13: Calibrate fetch concurrency before BFS loop starts
    await calibrateFetchConcurrency(this.pegaClient, initialCount, this.log);
    this.log(`[BfsIndexer] 🚀 Starting BFS loop: ${initialCount} seeds (max iterations: ${maxIterations})`);

    while (fetchQueue.length > 0) {
      if (processed >= maxIterations) {
        this.log(`[BfsIndexer] ⚠️ Hit max iterations (${maxIterations}). Stopping BFS.`);
        break;
      }
      const batch = fetchQueue.splice(0, BATCH_SIZE);
      processed += batch.length;
      report.report({
        message: `BFS: fetching ${processed}/${processed + fetchQueue.length} (queue: ${fetchQueue.length})`,
      });
      await this.processBatch(batch, projectId, fetchQueue, dedupSet, root, counters);
    }

    this.log(`[BfsIndexer] ✅ BFS complete: ingested=${counters.totalIngested}, discovered=${counters.discoveredCount}, errors=${counters.errorCount}`);
    return { ...counters, initialCount };
  }

  /** Fetch one batch, ingest rules, enqueue discovered relatives. */
  private async processBatch(
    batch: CrawlPlanItem[],
    projectId: string,
    fetchQueue: CrawlPlanItem[],
    dedupSet: MembershipSet,
    root: string,
    counters: { totalIngested: number; discoveredCount: number; skippedCount: number; errorCount: number },
  ): Promise<void> {
    // Resilient mode passes abortOnServerError=false so a lone 5xx does not kill the run.
    const fetchResult = await fetchRulesInParallel(batch, this.pegaClient, this.log, !this.resilient);
    if (fetchResult.serverError) {
      this.log(`[BfsIndexer] ⛔ Server error — aborting BFS: ${fetchResult.serverError}`);
      throw new Error(fetchResult.serverError);
    }

    for (const { ruleObj, item } of fetchResult.fetched) {
      saveRuleFile(ruleObj, root, this.log, item.pxObjClass, item.pyRuleName);
      // SA4E-241: carry the catalog-resolved checksum (computePegaChecksum, NT-2)
      // through to ingest so the STORED content_hash equals the value bulk-check
      // compares against (INV-1). Without this the stored hash would diverge and
      // no-change skip would never trigger for Pega rules.
      const result = await this.ingestAndDiscover(projectId, ruleObj, item.checksum);
      if (result.ingested) { counters.totalIngested++; } else { counters.skippedCount++; }
      counters.discoveredCount += this.enqueueRelatives(result.relatives, fetchQueue, dedupSet);

      // SA4E-214: Hook schema creation/validation (async, non-blocking)
      this.triggerSchemaHook(item.pxObjClass, ruleObj);
    }
    counters.errorCount += batch.length - fetchResult.fetched.length;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

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
  ): Promise<{ ingested: boolean; relatives: UnresolvedDependency[] }> {
    try {
      const checksum = presetChecksum ?? this.computeChecksum(ruleJson);
      const version = (ruleJson.pyRuleSetVersion as string) || undefined;

      const result = await this.ingester.ingestSingleRule(projectId, ruleJson, checksum, version);
      const ingested = result.status === 'success' && result.ruleId !== undefined && result.ruleId !== -1;
      return { ingested, relatives: result.unresolvedDependencies || [] };
    } catch (err: any) {
      this.log(`[BfsIndexer] ⚠️ Ingest error (skipping): ${err.message}`);
      return { ingested: false, relatives: [] };
    }
  }

  /** Enqueue relatives not yet seen — returns count of newly added items */
  private enqueueRelatives(
    relatives: UnresolvedDependency[],
    fetchQueue: CrawlPlanItem[],
    dedupSet: MembershipSet,
  ): number {
    let count = 0;
    for (const dep of relatives) {
      if (fetchQueue.length >= MAX_QUEUE_SIZE) {
        this.log(`[BfsIndexer] ⚠️ Queue full (${MAX_QUEUE_SIZE}). Skipping remaining relatives.`);
        break;
      }
      const key = DependencyMapper.dedupKey(dep);
      if (!dedupSet.has(key)) {
        dedupSet.add(key);
        fetchQueue.push(DependencyMapper.toCrawlPlanItem(dep));
        count++;
      }
    }
    return count;
  }

  /**
   * SA4E-241 — Compute the Pega rule checksum (Source B) from the rule's 3 basic
   * fields using the SHARED formula (computePegaChecksum, NT-2) so a rule fetched
   * outside the catalog gets the SAME content_hash as its catalog checksum (INV-1).
   * ⛔ Do NOT hash the full JSON — that value would never match bulk-check.
   */
  private computeChecksum(rule: Record<string, unknown>): string {
    return computePegaChecksum({
      pzInsKey: String(rule.pzInsKey ?? ""),
      pxUpdateDateTime: rule.pxUpdateDateTime as string | undefined,
      pxSaveDateTime: rule.pxSaveDateTime as string | undefined,
    });
  }

  /**
   * SA4E-214: Fire-and-forget schema hook.
   * First encounter of a rule type → trigger async schema creation.
   * Subsequent encounters → trigger progressive validation (field discovery).
   * Non-blocking: errors are logged but never propagate to BFS loop (BR-06).
   */
  private triggerSchemaHook(ruleType: string, ruleJson: Record<string, unknown>): void {
    if (!this.schemaOrchestrator) return;

    if (!this.seenRuleTypes.has(ruleType)) {
      // First encounter → create schema (async, fire-and-forget)
      this.seenRuleTypes.add(ruleType);
      this.schemaOrchestrator.createSchema(ruleType).catch(err =>
        this.log(`[BfsIndexer] ⚠️ Schema creation failed for ${ruleType}: ${err.message}`),
      );
    } else {
      // Subsequent encounter → progressive validation
      this.schemaOrchestrator.validateAndUpdate(ruleType, ruleJson).catch(() => {
        /* non-fatal, silent */
      });
    }
  }
}
