import { getSetting } from "../../config/settings-migration";
/**
 * Pipeline tuning defaults + settings reader for the BFS indexer.
 * These mirror the `sdlcAgents.pega.*` settings declared in package.json and
 * are used when a setting is unset/invalid. Read at runtime (readPipelineConfig)
 * so a change in Settings takes effect on the next index run without reloading
 * the window.
 */

import * as vscode from "vscode";
import type { PipelineTuning } from "./types";

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
export const MIN_BFS_ITERATIONS = 10_000;

/** Maximum queue size before BFS stops enqueueing new relatives (CWE-400 mitigation) */
export const MAX_QUEUE_SIZE = 50_000;

/**
 * Read + clamp the pipeline tuning from `sdlcAgents.pega.*` settings.
 * Called at the start of each run so edits in the Settings UI apply to the next
 * index without a reload. Invalid/out-of-range values fall back to safe defaults.
 */
export function readPipelineConfig(): PipelineTuning {
  const clamp = (v: number | undefined, def: number, b: { min: number; max: number }): number =>
    (typeof v === "number" && Number.isFinite(v)) ? Math.min(b.max, Math.max(b.min, Math.round(v))) : def;

  const fetchBatchSize = clamp(getSetting<number>("pega.fetchBatchSize", "pega.fetchBatchSize", 50), DEFAULT_FETCH_BATCH_SIZE, FETCH_BATCH_SIZE_BOUNDS);
  const ingestConcurrency = clamp(getSetting<number>("pega.ingestConcurrency", "pega.ingestConcurrency", 10), DEFAULT_INGEST_CONCURRENCY, INGEST_CONCURRENCY_BOUNDS);

  // Channel capacity: 0/unset → auto (2× ingest concurrency). Otherwise clamp.
  const rawCapacity = getSetting<number>("pega.ingestChannelCapacity", "pega.ingestChannelCapacity", 0);
  const channelCapacity = (typeof rawCapacity === "number" && rawCapacity >= 1)
    ? clamp(rawCapacity, ingestConcurrency * 2, CHANNEL_CAPACITY_BOUNDS)
    : ingestConcurrency * 2;

  return { fetchBatchSize, ingestConcurrency, channelCapacity };
}
