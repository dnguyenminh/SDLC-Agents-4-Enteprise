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
 *
 * Implementation lives in ./PegaBfsPipeline/* (same public API, same path).
 */

export { PegaBfsPipeline } from "./PegaBfsPipeline/pipeline";
export type {
  BfsCounters,
  BfsRunResult,
  FetchedRule,
  IngestFn,
  PipelineOptions,
  ProgressFn,
} from "./PegaBfsPipeline/types";
