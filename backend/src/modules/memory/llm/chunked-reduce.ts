/**
 * chunkedReduce<T> — SA4E-338 OI-04 shared helper.
 *
 * Generic sequential chunk loop (mapFn/mergeFn injected).
 * Consumed by TagAnalyzerService.analyzeWithChunking (behavior-preserving)
 * and ReductionPipeline.mapChunks.
 *
 * Supports two merge patterns:
 *  - mergeFn: (results: T[]) => T  (enrichment — full results array)
 *  - reduceFn + initial: (acc, chunkResult) => T  (analyzer — incremental merge)
 *  - Both can be provided; reduceFn takes precedence when both exist
 *
 * No whole-batch retry — per-chunk isolation, merge at end.
 */

import type { Logger } from 'pino';

export interface ChunkedReduceOptions<T, C> {
  chunks: C[];
  mapFn: (chunk: C, index: number, ctx: { attempt: number }) => Promise<T>;
  /** Full-array merge (enrichment pattern). */
  mergeFn?: (results: T[]) => T;
  /** Initial accumulator (analyzer pattern). */
  initial?: T;
  /** Incremental merge (analyzer pattern). */
  reduceFn?: (acc: T, chunkResult: T, index: number) => T;
  maxRetriesPerChunk?: number; // default 2 (3 attempts)
  onChunkFailure?: (chunk: C, index: number, err: unknown, attempt: number) => 'retry' | 'abort' | 'degrade';
  backoffMs?: (attempt: number) => number; // default a => 200 * 2 ** a
  logger?: Logger;
  signal?: AbortSignal;
}

/**
 * Sequential for-of over chunks — same control shape as
 * TagAnalyzerService.analyzeWithChunking: per-chunk try/catch,
 * per-chunk isolation, merge at end. No whole-batch retry.
 */
export async function chunkedReduce<T, C>(
  opts: ChunkedReduceOptions<T, C>,
): Promise<T> {
  const {
    chunks,
    mapFn,
    mergeFn,
    initial,
    reduceFn,
    maxRetriesPerChunk = 2,
    onChunkFailure,
    backoffMs = (a) => 200 * 2 ** a,
    logger,
    signal,
  } = opts;

  const results: T[] = [];
  let acc: T | undefined = initial;
  const useReduce = reduceFn !== undefined && acc !== undefined;

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    let lastErr: unknown = null;
    let succeeded = false;

    for (let attempt = 0; attempt <= maxRetriesPerChunk; attempt++) {
      if (signal?.aborted) {
        throw new Error('chunkedReduce aborted');
      }

      try {
        const result = await mapFn(chunk, ci, { attempt });
        if (useReduce && acc !== undefined) {
          acc = reduceFn!(acc, result, ci);
        } else {
          results.push(result);
        }
        succeeded = true;
        break;
      } catch (err) {
        lastErr = err;
        const decision = onChunkFailure?.(chunk, ci, err, attempt);

        if (decision === 'abort') {
          throw err;
        }

        if (decision === 'degrade' || attempt >= maxRetriesPerChunk) {
          logger?.warn(
            { chunkIndex: ci, attempt, reason: String(err) },
            'chunkedReduce chunk degraded',
          );
          break;
        }

        // retry
        await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      }
    }
  }

  if (useReduce && acc !== undefined) {
    return acc;
  }

  if (mergeFn) {
    return mergeFn(results);
  }

  // Fallback: return last result or empty array cast as T
  return results as unknown as T;
}
