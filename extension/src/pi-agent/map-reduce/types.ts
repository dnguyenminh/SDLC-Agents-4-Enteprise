export interface Batch {
  id: string;
  files: string[];
  subQuery: string;
  maxTokens: number;
}

export interface SubAgentResponse {
  summary: string;
  tokens: number;
  confidence: number;
}

/** SEC-327-02: max summary chars = subAgentTokenCap × SUMMARY_CHARS_PER_TOKEN. */
export const SUMMARY_CHARS_PER_TOKEN = 4;

/**
 * SEC-327-02: boundary validation for untrusted sub-agent output (LLM-backed).
 * Validates the response shape before it enters the reduce prompt, session
 * context, or metrics: summary truncated to maxSummaryChars, non-string
 * summary dropped, non-finite/negative tokens floored to 0, confidence clamped
 * to [0,1]. Never trusts the producer.
 */
export function sanitizeSubAgentResponse(
  batchId: string,
  raw: SubAgentResponse | unknown,
  maxSummaryChars: number
): PartialSummary {
  const response = (raw ?? {}) as Partial<SubAgentResponse>;
  const summary =
    typeof response.summary === 'string' ? response.summary.slice(0, maxSummaryChars) : '';
  const tokens =
    typeof response.tokens === 'number' && Number.isFinite(response.tokens) && response.tokens >= 0
      ? Math.floor(response.tokens)
      : 0;
  const confidence =
    typeof response.confidence === 'number' && Number.isFinite(response.confidence)
      ? Math.min(1, Math.max(0, response.confidence))
      : 0;
  return { batchId, summary, tokens, confidence };
}

export interface SubAgentClient {
  summarizeBatch(query: string, batch: Batch): Promise<SubAgentResponse>;
  synthesize(query: string, partials: PartialSummary[]): Promise<string>;
}

export interface PartialSummary {
  batchId: string;
  summary: string;
  tokens: number;
  confidence: number;
}

export interface MapReduceConfig {
  batchSize: number;
  parallelism: number;
  batchTimeoutMs: number;
  retriesPerBatch: number;
  retryBackoffMs: number;
  maxFiles: number;
  subAgentTokenCap: number;
}

export const DEFAULT_MAP_REDUCE_CONFIG: MapReduceConfig = {
  batchSize: 20,
  parallelism: 5,
  batchTimeoutMs: 30_000,
  retriesPerBatch: 1,
  retryBackoffMs: 200,
  maxFiles: 200,
  subAgentTokenCap: 4000,
};

export interface MapReduceResult {
  answer: string;
  batches: Batch[];
  partials: PartialSummary[];
  timedOutBatches: string[];
  skippedBatches: string[];
  elapsedMs: number;
}
