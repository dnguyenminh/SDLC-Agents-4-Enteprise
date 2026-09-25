/**
 * PegaBfsPipeline — Producer-consumer pipeline for the Pega BFS crawl.
 *
 * Root-cause perf fix: the old design fetched a batch then ingested it serially,
 * so network + CPU sat idle on each ingest round-trip, and the next batch's fetch
 * only started after the current batch fully ingested. This pipeline runs the
 * supplier (fetch) and N consumers (ingest) concurrently through a bounded channel:
 *   supplier → BoundedChannel<FetchedRule> → N consumers → serial drain
 *
 * Concurrency model:
 *  - Supplier: 1 loop. Pulls FIFO batches off fetchQueue, fetches rule content in
 *    parallel (fetchRulesInParallel), pushes each fetched rule into the channel.
 *  - Consumers: N. Each takes a rule, ingests it via HTTP (the slow, parallelizable
 *    part), then runs the SERIAL drain under a lock.
 *  - Serial drain: enqueueRelatives + counters mutate fetchQueue/dedupSet, which are
 *    NOT concurrency-safe (DiskBackedSet is single-threaded by design). A lightweight
 *    async lock serializes just this cheap in-memory section — no I/O inside it.
 *
 * BFS liveness: relatives discovered during ingest are pushed back onto fetchQueue.
 * The run ends only when fetchQueue is empty AND no rule is in-flight (fetched but
 * not yet drained), which the supplier tracks via an in-flight counter.
 */

import type { CrawlPlanItem } from "../models";
import type { UnresolvedDependency } from "./DependencyMapper";
import type { MembershipSet } from "./DiskBackedSet";
import { DependencyMapper } from "./DependencyMapper";
import { BoundedChannel } from "./bounded-channel";
import { fetchRulesInParallel } from "./PegaCrawlHelper";
import type { PegaHttpClient } from "./PegaHttpClient";

type LogFn = (msg: string) => void;

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
}

/**
 * Drives the supplier + consumers + serial drain for one BFS crawl.
 * Pattern: single-use orchestrator — construct, call run(), discard.
 */
export class PegaBfsPipeline {
  private inFlight = 0;
  private processed = 0;
  private aborted: string | null = null;
  /** Rules that failed to fetch (not-found/skip); folded into counters at run end. */
  private fetchErrors = 0;
  /** Lock tail: chaining promises serializes the drain section across consumers. */
  private drainLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly pegaClient: PegaHttpClient,
    private readonly log: LogFn,
    private readonly opts: PipelineOptions,
    private readonly ingestFn: IngestFn,
    private readonly onProgress?: ProgressFn,
  ) {}

  /**
   * Run the pipeline until the fetch queue drains and nothing is in-flight.
   * @throws Error if a non-resilient run hits a server error (abort).
   */
  async run(
    fetchQueue: CrawlPlanItem[],
    dedupSet: MembershipSet,
    counters: BfsCounters,
  ): Promise<void> {
    const channel = new BoundedChannel<FetchedRule>(this.opts.channelCapacity);

    // Consumers start first so they can drain as soon as the supplier pushes.
    const consumers = Array.from({ length: this.opts.ingestConcurrency }, () =>
      this.consume(channel, fetchQueue, dedupSet, counters),
    );

    await this.supply(channel, fetchQueue);
    await Promise.all(consumers);

    // Fold fetch-time failures into the shared counters once, after all workers
    // have finished (no concurrent writer remains).
    counters.errorCount += this.fetchErrors;

    if (this.aborted) { throw new Error(this.aborted); }
  }

  /** Supplier loop: fetch batches and push fetched rules into the channel. */
  private async supply(channel: BoundedChannel<FetchedRule>, fetchQueue: CrawlPlanItem[]): Promise<void> {
    // Continue while there is queued work OR rules still in-flight (their relatives
    // may refill the queue). Stop early on abort or the CWE-400 iteration cap.
    while (!this.aborted && (fetchQueue.length > 0 || this.inFlight > 0)) {
      if (this.processed >= this.opts.maxIterations) {
        this.log(`[BfsPipeline] ⚠️ Hit max iterations (${this.opts.maxIterations}). Stopping supply.`);
        break;
      }
      if (fetchQueue.length === 0) {
        // In-flight rules exist but queue momentarily empty — yield, let consumers
        // drain relatives back onto the queue, then re-check.
        await this.sleep(15);
        continue;
      }

      const batch = fetchQueue.splice(0, this.opts.fetchBatchSize);
      this.inFlight += batch.length;
      this.processed += batch.length;
      this.onProgress?.(this.processed, fetchQueue.length);

      const fetchResult = await fetchRulesInParallel(batch, this.pegaClient, this.log, !this.opts.resilient);
      if (fetchResult.serverError) {
        this.aborted = fetchResult.serverError;
        // These rules never reach a consumer, so release their in-flight count.
        this.inFlight -= batch.length;
        break;
      }

      // Rules that failed to fetch (not-found/skip) never reach a consumer; count
      // them as errors and release their in-flight slots so liveness holds.
      // Safe to mutate counters here: the supplier is a single loop and errorCount
      // is never touched inside the (consumer-side) drain section.
      const missed = batch.length - fetchResult.fetched.length;
      if (missed > 0) { this.inFlight -= missed; this.fetchErrors += missed; }

      for (const fetched of fetchResult.fetched) {
        await channel.push(fetched); // backpressure: blocks if consumers lag
      }
    }
    channel.close();
  }

  /** Consumer loop: ingest one rule (parallel), then drain results (serial). */
  private async consume(
    channel: BoundedChannel<FetchedRule>,
    fetchQueue: CrawlPlanItem[],
    dedupSet: MembershipSet,
    counters: BfsCounters,
  ): Promise<void> {
    while (true) {
      const next = await channel.take();
      if (next.done) { return; }
      const fetched = next.value;

      // Slow, parallelizable part — HTTP POST to backend. Runs OUTSIDE the lock.
      let outcome: { ingested: boolean; relatives: UnresolvedDependency[] };
      try {
        outcome = await this.ingestFn(fetched);
      } catch (err: any) {
        this.log(`[BfsPipeline] ⚠️ Ingest error (skipping): ${err?.message ?? err}`);
        outcome = { ingested: false, relatives: [] };
      }

      // Cheap in-memory mutation — serialized via the drain lock (DiskBackedSet and
      // the FIFO queue are not concurrency-safe). No I/O happens inside here.
      await this.drain(fetched, outcome, fetchQueue, dedupSet, counters);
      this.inFlight--;
    }
  }

  /** Serialize the queue/dedup/counter mutation across all consumers via a lock. */
  private async drain(
    fetched: FetchedRule,
    outcome: { ingested: boolean; relatives: UnresolvedDependency[] },
    fetchQueue: CrawlPlanItem[],
    dedupSet: MembershipSet,
    counters: BfsCounters,
  ): Promise<void> {
    // Chain onto the lock tail so only one drain body runs at a time.
    const prior = this.drainLock;
    let release: () => void;
    this.drainLock = new Promise<void>((res) => { release = res; });
    await prior;
    try {
      if (outcome.ingested) { counters.totalIngested++; } else { counters.skippedCount++; }
      counters.discoveredCount += this.enqueueRelatives(outcome.relatives, fetchQueue, dedupSet);
    } finally {
      release!();
    }
  }

  /** Enqueue not-yet-seen relatives — returns count newly added. Serial-only. */
  private enqueueRelatives(
    relatives: UnresolvedDependency[],
    fetchQueue: CrawlPlanItem[],
    dedupSet: MembershipSet,
  ): number {
    let count = 0;
    for (const dep of relatives) {
      if (fetchQueue.length >= this.opts.maxQueueSize) {
        this.log(`[BfsPipeline] ⚠️ Queue full (${this.opts.maxQueueSize}). Skipping remaining relatives.`);
        break;
      }
      const key = DependencyMapper.dedupKey(dep);
      if (!dedupSet.has(key)) {
        const item = DependencyMapper.toCrawlPlanItem(dep);
        if (!item) continue;
        dedupSet.add(key);
        fetchQueue.push(item);
        count++;
      }
    }
    return count;
  }

  /** Promise-based sleep for the supplier's brief in-flight wait. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
