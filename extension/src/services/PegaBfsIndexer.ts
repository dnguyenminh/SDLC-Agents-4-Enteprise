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
import { saveRuleFile, calibrateFetchConcurrency } from "./PegaCrawlHelper";
import { PegaStreamIngester } from "./PegaStreamIngester";
import type { UnresolvedDependency } from "./DependencyMapper";
import type { MembershipSet } from "./DiskBackedSet";
import { PegaBfsPipeline, type FetchedRule } from "./PegaBfsPipeline";

type ProgressReporter = vscode.Progress<{ message?: string }>;
type LogFn = (msg: string) => void;

/**
 * Pipeline tuning defaults. These mirror the `kiroSdlc.pega.*` settings declared
 * in package.json and are used when a setting is unset/invalid. Read at runtime
 * (readPipelineConfig) so a change in Settings takes effect on the next index run
 * without reloading the window.
 */
const DEFAULT_FETCH_BATCH_SIZE = 50;
const DEFAULT_INGEST_CONCURRENCY = 10;

/** Clamp bounds — must match the min/max declared in package.json. */
const FETCH_BATCH_SIZE_BOUNDS = { min: 1, max: 1000 } as const;
const INGEST_CONCURRENCY_BOUNDS = { min: 1, max: 64 } as const;
const CHANNEL_CAPACITY_BOUNDS = { min: 1, max: 512 } as const;

/**
 * Floor for the max-iteration guard (CWE-400 mitigation). The effective cap is
 * computed per run as seeds + MAX_QUEUE_SIZE so an authoritative catalog list
 * (e.g. 17,978 rules) is never truncated, while still bounding runaway crawls.
 */
const MIN_BFS_ITERATIONS = 10_000;

/** Maximum queue size before BFS stops enqueueing new relatives (CWE-400 mitigation) */
const MAX_QUEUE_SIZE = 50_000;

/** Effective pipeline tuning resolved from settings for one run. */
interface PipelineTuning {
  fetchBatchSize: number;
  ingestConcurrency: number;
  channelCapacity: number;
}

/**
 * Read + clamp the pipeline tuning from `kiroSdlc.pega.*` settings.
 * Called at the start of each run so edits in the Settings UI apply to the next
 * index without a reload. Invalid/out-of-range values fall back to safe defaults.
 */
function readPipelineConfig(): PipelineTuning {
  const cfg = vscode.workspace.getConfiguration("kiroSdlc");
  const clamp = (v: number | undefined, def: number, b: { min: number; max: number }): number =>
    (typeof v === "number" && Number.isFinite(v)) ? Math.min(b.max, Math.max(b.min, Math.round(v))) : def;

  const fetchBatchSize = clamp(cfg.get<number>("pega.fetchBatchSize"), DEFAULT_FETCH_BATCH_SIZE, FETCH_BATCH_SIZE_BOUNDS);
  const ingestConcurrency = clamp(cfg.get<number>("pega.ingestConcurrency"), DEFAULT_INGEST_CONCURRENCY, INGEST_CONCURRENCY_BOUNDS);

  // Channel capacity: 0/unset → auto (2× ingest concurrency). Otherwise clamp.
  const rawCapacity = cfg.get<number>("pega.ingestChannelCapacity");
  const channelCapacity = (typeof rawCapacity === "number" && rawCapacity >= 1)
    ? clamp(rawCapacity, ingestConcurrency * 2, CHANNEL_CAPACITY_BOUNDS)
    : ingestConcurrency * 2;

  return { fetchBatchSize, ingestConcurrency, channelCapacity };
}

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

    // Read tuning from settings at run start so Settings-UI edits apply to the next
    // index run without a window reload (effect-on-next-run semantics).
    const tuning = readPipelineConfig();

    // BR-13: Calibrate fetch concurrency before the crawl starts.
    await calibrateFetchConcurrency(this.pegaClient, initialCount, this.log);
    this.log(`[BfsIndexer] 🚀 Starting BFS pipeline: ${initialCount} seeds (max iterations: ${maxIterations}) | batch=${tuning.fetchBatchSize}, ingestConcurrency=${tuning.ingestConcurrency}, channelCapacity=${tuning.channelCapacity}`);

    // Producer-consumer pipeline: the supplier fetches while N consumers ingest,
    // so network + CPU stay busy instead of idling on serial round-trips. The
    // ingest itself (the slow part) is injected here; queue/dedup mutation stays
    // serial inside the pipeline (DiskBackedSet is not concurrency-safe).
    const pipeline = new PegaBfsPipeline(
      this.pegaClient,
      this.log,
      {
        fetchBatchSize: tuning.fetchBatchSize,
        ingestConcurrency: tuning.ingestConcurrency,
        channelCapacity: tuning.channelCapacity,
        maxQueueSize: MAX_QUEUE_SIZE,
        maxIterations,
        resilient: this.resilient,
      },
      (fetched: FetchedRule) => this.ingestOne(projectId, fetched, root),
      (processed, queued) => report.report({
        message: `BFS: fetching ${processed}/${processed + queued} (queue: ${queued})`,
      }),
    );

    await pipeline.run(fetchQueue, dedupSet, counters);

    this.log(`[BfsIndexer] ✅ BFS complete: ingested=${counters.totalIngested}, discovered=${counters.discoveredCount}, errors=${counters.errorCount}`);
    return { ...counters, initialCount };
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
    saveRuleFile(ruleObj, root, this.log, item.pxObjClass, item.pyRuleName);
    // SA4E-241: carry the catalog-resolved checksum (computePegaChecksum, NT-2)
    // through to ingest so the STORED content_hash equals the value bulk-check
    // compares against (INV-1). Without this the stored hash would diverge and
    // no-change skip would never trigger for Pega rules.
    const result = await this.ingestAndDiscover(projectId, ruleObj, item.checksum);
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
  ): Promise<{ ingested: boolean; relatives: UnresolvedDependency[] }> {
    try {
      const checksum = presetChecksum ?? this.computeChecksum(ruleJson);
      const version = (ruleJson.pyRuleSetVersion as string) || undefined;

      const result = await this.ingester.ingestSingleRule(projectId, ruleJson, checksum, version);
      const ingested = result.status === 'success' && result.ruleId !== undefined && result.ruleId !== -1;
      // Observability: ingestSingleRule is silent on success (to avoid per-rule log
      // spam across thousands of rules). Surface only backend-reported NON-success so
      // a silently-rejected ingest is visible instead of looking like "nothing happened".
      if (!ingested) {
        const pzInsKey = String(ruleJson.pzInsKey ?? ruleJson.insKey ?? '');
        const pxObjClass = String(ruleJson.pxObjClass ?? '');
        const pyRuleName = String(ruleJson.pyRuleName ?? '');
        const icon = result.reason === 'checksum_match' ? 'ℹ️' : '⚠️';
        this.log(`[Pega Ingester] ${icon} Backend did not store rule (status=${result.status}, ruleId=${result.ruleId ?? 'none'}${result.reason ? `, reason=${result.reason}` : ''}) insKey=${pzInsKey} pxObjClass=${pxObjClass} pyRuleName=${pyRuleName}`);
      }
      return { ingested, relatives: result.unresolvedDependencies || [] };
    } catch (err: any) {
      this.log(`[Pega Ingester] ❌ Ingest POST failed (skipping): ${err.message}`);
      return { ingested: false, relatives: [] };
    }
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
