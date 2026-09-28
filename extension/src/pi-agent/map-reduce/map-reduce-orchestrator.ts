import { logger } from '../../logger';
import { withTimeout } from '../async-timeout';
import { sleep } from '../context-retrieval/search-provider';
import { CircuitBreaker, getSharedCircuitBreaker } from './circuit-breaker';
import { pLimit } from './p-limit';
import type { TaskDecomposer } from '../task-decomposer';
import type {
  Batch,
  MapReduceConfig,
  MapReduceResult,
  PartialSummary,
  SubAgentClient,
} from './types';
import { DEFAULT_MAP_REDUCE_CONFIG, SUMMARY_CHARS_PER_TOKEN, sanitizeSubAgentResponse } from './types';

export interface MapReduceOrchestratorDeps {
  subAgent: SubAgentClient;
  decomposer: TaskDecomposer;
  breaker?: CircuitBreaker;
  config?: Partial<MapReduceConfig>;
}

interface BatchOutcome {
  batchId: string;
  partial?: PartialSummary;
  timedOut?: boolean;
  skipped?: boolean;
}

export class MapReduceOrchestrator {
  private readonly config: MapReduceConfig;
  private readonly breaker: CircuitBreaker;
  private readonly maxSummaryChars: number;

  constructor(private readonly deps: MapReduceOrchestratorDeps) {
    this.config = { ...DEFAULT_MAP_REDUCE_CONFIG, ...deps.config };
    // SEC-327-01: default to the shared session-scoped breaker — state persists
    // across queries and orchestrator re-instantiations (per-instance breakers
    // reset every query, voiding cross-query DoS protection).
    this.breaker = deps.breaker ?? getSharedCircuitBreaker();
    this.maxSummaryChars = this.config.subAgentTokenCap * SUMMARY_CHARS_PER_TOKEN;
  }

  async run(query: string, files: string[]): Promise<MapReduceResult> {
    const startedAt = Date.now();
    const batches = this.decompose(query, files);
    const { partials, timedOut, skipped } = await this.map(query, batches);
    const answer = await this.reduce(query, partials);
    return {
      answer,
      batches,
      partials,
      timedOutBatches: timedOut,
      skippedBatches: skipped,
      elapsedMs: Date.now() - startedAt,
    };
  }

  decompose(query: string, files: string[]): Batch[] {
    return this.deps.decomposer.decompose(query, files, {
      batchSize: this.config.batchSize,
      maxBatchTokens: this.config.subAgentTokenCap,
    });
  }

  async map(
    query: string,
    batches: Batch[]
  ): Promise<{ partials: PartialSummary[]; timedOut: string[]; skipped: string[] }> {
    const limit = pLimit(this.config.parallelism);
    const outcomes = await Promise.all(batches.map((batch) => limit(() => this.mapBatch(query, batch))));
    return collectOutcomes(outcomes);
  }

  async mapBatch(query: string, batch: Batch): Promise<BatchOutcome> {
    const maxAttempts = this.config.retriesPerBatch + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (!this.breaker.canProceed()) return { batchId: batch.id, skipped: true };
      const outcome = await this.attemptBatch(query, batch);
      if (outcome) return outcome;
      if (attempt < maxAttempts - 1) await sleep(this.config.retryBackoffMs);
    }
    return { batchId: batch.id, timedOut: true };
  }

  private async attemptBatch(query: string, batch: Batch): Promise<BatchOutcome | null> {
    try {
      const response = await withTimeout(
        this.deps.subAgent.summarizeBatch(query, batch),
        this.config.batchTimeoutMs,
        `Batch ${batch.id} timed out after ${this.config.batchTimeoutMs}ms`
      );
      this.breaker.recordSuccess();
      // SEC-327-02: boundary validation — sub-agent output is untrusted
      // (LLM-backed); validate shape before it reaches the reduce prompt,
      // session context, or metrics.
      return {
        batchId: batch.id,
        partial: sanitizeSubAgentResponse(batch.id, response, this.maxSummaryChars),
      };
    } catch (err) {
      this.breaker.recordFailure();
      logger.warn(`Batch ${batch.id} failed`, { error: (err as Error).message });
      return null;
    }
  }

  async reduce(query: string, partials: PartialSummary[]): Promise<string> {
    if (partials.length === 0) return '';
    try {
      return await this.deps.subAgent.synthesize(query, partials);
    } catch (err) {
      logger.warn('Reduce synthesis failed, concatenating partial summaries', {
        error: (err as Error).message,
      });
      return partials.map((partial) => partial.summary).join('\n\n');
    }
  }
}

function collectOutcomes(
  outcomes: BatchOutcome[]
): { partials: PartialSummary[]; timedOut: string[]; skipped: string[] } {
  const partials: PartialSummary[] = [];
  const timedOut: string[] = [];
  const skipped: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.partial) partials.push(outcome.partial);
    else if (outcome.timedOut) timedOut.push(outcome.batchId);
    else if (outcome.skipped) skipped.push(outcome.batchId);
  }
  return { partials, timedOut, skipped };
}
