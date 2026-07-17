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
}

export const DEFAULT_TASK_WORKER_CONFIG: TaskWorkerConfig = {
  baseInterval: 2000,
  maxInterval: 30000,
  staleThreshold: 300000,
  maxRetries: 3,
};
