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
