/**
 * TaskWorkerConfig — SA4E-44
 * Configuration interface for the background task worker.
 */

export interface TaskWorkerConfig {
  /** Polling interval when queue has items (ms). Default: 2000 (BR-2). */
  baseInterval: number;
  /** Max backoff interval when queue empty (ms). Default: 30000 (BR-2). */
  maxInterval: number;
  /** Time before PROCESSING task is stale (ms). Default: 300000 (BR-4). */
  staleThreshold: number;
  /** Max retry attempts per task. Default: 3 (BR-3). */
  maxRetries: number;

  // ── SA4E-47: Context Chain & Chunking ──
  /** Enable context chain between sections (default: true). */
  enableContextChain: boolean;
  /** Max length of context chain summary in chars (default: 500). */
  contextChainMaxLength: number;
  /** LLM chunk size in chars before chunking (default: 6000). */
  llmChunkSize: number;
  /** Overlap between chunks in chars (default: 200). */
  llmChunkOverlap: number;
  /** LLM timeout in ms (default: 30000). */
  llmTimeout: number;
  /** Max structured_map size in bytes (default: 102400 = 100KB). */
  structuredMapMaxSize: number;

  /**
   * Number of tasks processed in parallel per poll cycle (default: 2).
   * Set to 2-3 for local LLM (LM Studio/Ollama) to keep GPU busy between token batches.
   * Set to 1 for slow/remote LLMs or when strict context chain ordering is required.
   */
  concurrency: number;

  /**
   * Confidence threshold for applying tags (default: 0.6).
   * Tags returned by LLM with confidence >= this value will be saved.
   * Configurable via Admin UI → Configuration → llm → tagConfidenceThreshold.
   */
  tagConfidenceThreshold: number;
}

export const DEFAULT_TASK_WORKER_CONFIG: TaskWorkerConfig = {
  baseInterval: 2000,
  maxInterval: 30000,
  staleThreshold: 300000,
  maxRetries: 3,
  enableContextChain: true,
  contextChainMaxLength: 500,
  llmChunkSize: 6000,
  llmChunkOverlap: 200,
  llmTimeout: 30000,
  structuredMapMaxSize: 102400,
  concurrency: 2,
  tagConfidenceThreshold: 0.6,
};
