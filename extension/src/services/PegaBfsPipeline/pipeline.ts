/** PegaBfsPipeline implementation — see facade ../PegaBfsPipeline.ts for design rationale. */
import type { CrawlPlanItem } from "../../models";
import type { UnresolvedDependency } from "../DependencyMapper";
import type { MembershipSet } from "../DiskBackedSet";
import { BoundedChannel } from "../bounded-channel";
import { fetchRulesInParallel } from "../PegaCrawlHelper";
import type { PegaHttpClient } from "../PegaHttpClient";
import { enqueueRelatives } from "./relatives";
import type { BfsCounters, FetchedRule, IngestFn, LogFn, PipelineOptions, ProgressFn, BfsRunResult } from "./types";

/** Drives supplier + consumers + serial drain for one BFS crawl (single-use orchestrator). */
export class PegaBfsPipeline {
  private inFlight = 0;
  private processed = 0;
  private aborted: string | null = null;
  /** Rules that failed to fetch (not-found/skip); folded into counters at run end. */
  private fetchErrors = 0;
  /** Lock tail: chaining promises serializes the drain section across consumers. */
  private drainLock: Promise<void> = Promise.resolve();
  /** SA4E-362 FR-4 + SEC-01: set MỘT LẦN từ shouldStop() đầu tiên trả non-null (idempotent). */
  private stopReason: "auth" | null = null;
  /** SA4E-362 FR-4: snapshot observability tại thời điểm stop. */
  private inFlightAtStop = 0;
  /** SA4E-362 FR-4 (deadlock guard): số item bị drain-and-discard sau khi stop. */
  private discardedAtStop = 0;

  constructor(
    private readonly pegaClient: PegaHttpClient,
    private readonly log: LogFn,
    private readonly opts: PipelineOptions,
    private readonly ingestFn: IngestFn,
    private readonly onProgress?: ProgressFn,
  ) {}

  /**
   * Run the pipeline until the fetch queue drains and nothing is in-flight.
   * @returns BfsRunResult với stopReason (SA4E-362 FR-4) — 'auth' khi stop-hook kích hoạt.
   * @throws Error if a non-resilient run hits a server error (abort) — aborted vẫn thắng (EF-1).
   */
  async run(
    fetchQueue: CrawlPlanItem[],
    dedupSet: MembershipSet,
    counters: BfsCounters,
  ): Promise<BfsRunResult> {
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

    if (this.aborted) { throw new Error(this.aborted); } // GIỮ NGUYÊN — aborted vẫn thắng (EF-1)

    if (this.stopReason) {
      // SA4E-362 FR-4 + FSD 4.1 (SEC-01: reason chỉ còn literal 'auth' → label cố định).
      this.log(`[BfsPipeline] ⏸️ Stopped: paused due to auth (in-flight completed: ${this.inFlightAtStop - this.discardedAtStop}, buffered discarded: ${this.discardedAtStop})`);
    }
    return { stopReason: this.stopReason };
  }

  /** SA4E-362 FR-4 + SEC-01: đọc shouldStop() đúng MỘT lần đầu trả non-null — cache để reason không đổi giữa chừng. */
  private checkStop(): void {
    if (this.stopReason) { return; }
    const reason = this.opts.shouldStop?.() ?? null;
    if (reason) {
      this.stopReason = reason;
      this.inFlightAtStop = this.inFlight;
    }
  }

  /**
   * SA4E-362 FR-4 (deadlock guard — TDD gap fix): when stopped, drain buffered items
   * WITHOUT ingesting or counting them as skipped; an exiting consumer set would
   * otherwise hang run() forever (BR-4 "graceful stop"). Discarded items release
   * their in-flight slot so liveness accounting stays balanced.
   */
  private async drainDiscard(channel: BoundedChannel<FetchedRule>): Promise<void> {
    let next = await channel.take();
    while (!next.done) {
      this.discardedAtStop++;
      this.inFlight--;
      next = await channel.take();
    }
  }

  /** Supplier loop: fetch batches and push fetched rules into the channel. */
  private async supply(channel: BoundedChannel<FetchedRule>, fetchQueue: CrawlPlanItem[]): Promise<void> {
    // Continue while there is queued work OR rules still in-flight (their relatives
    // may refill the queue). Stop early on abort, stop-hook, or iteration cap.
    while (!this.aborted && !this.stopReason && (fetchQueue.length > 0 || this.inFlight > 0)) {
      this.checkStop();
      if (this.stopReason) { break; } // ngừng fetch/phát item mới — channel.close() ở cuối vẫn chạy
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
      this.checkStop();
      if (this.stopReason) {
        await this.drainDiscard(channel); // deadlock guard (FR-4) — see drainDiscard
        return; // exit KHÔNG đếm item còn lại là skipped (chưa từng được ingest)
      }
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
      counters.discoveredCount += enqueueRelatives(outcome.relatives, fetchQueue, dedupSet, {
        maxQueueSize: this.opts.maxQueueSize,
        log: this.log,
      });
    } finally {
      release!();
    }
  }

  /** Promise-based sleep for the supplier's brief in-flight wait. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
