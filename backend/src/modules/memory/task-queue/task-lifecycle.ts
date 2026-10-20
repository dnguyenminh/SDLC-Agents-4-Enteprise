/**
 * TaskWorker lifecycle helpers — extracted from TaskWorker (BR-18).
 * Startup recovery, progress lookup, config patching and task error handling.
 */
import type { Logger } from 'pino';
import type { PendingTask } from './models.js';
import type { PendingTaskRepository } from './PendingTaskRepository.js';
import type { TaskWorkerConfig } from './TaskWorkerConfig.js';
import type { TaskWorkerStats } from './TaskWorker.js';

/** Upper bound for parallel task processing — guards against runaway config. */
export const MAX_CONCURRENCY = 64;

/** SA4E-99: Get current progress info (file being processed). */
export async function getWorkerProgress(repo: PendingTaskRepository): Promise<{ file: string | null } | null> {
  const active = await repo.getFirstByStatus('PROCESSING');
  if (!active) return null;
  try {
    const payload = JSON.parse(active.payload);
    return { file: payload.filePath || payload.file_path || payload.source || null };
  } catch { return null; }
}

/**
 * Update mutable config fields at runtime — no restart needed.
 * Called when admin changes taskWorker config via Admin UI.
 * Supported keys: concurrency (1-MAX_CONCURRENCY), baseInterval, maxInterval.
 */
export function applyConfigPatch(
  config: TaskWorkerConfig, patch: Partial<Pick<TaskWorkerConfig, 'concurrency' | 'baseInterval' | 'maxInterval'>>, logger: Logger,
): void {
  if (patch.concurrency !== undefined && Number.isFinite(patch.concurrency)) {
    // Clamp to [1, MAX_CONCURRENCY]. Admin-configured values (e.g. 30) are honored;
    // only truly out-of-range values are bounded.
    (config as any).concurrency = Math.max(1, Math.min(patch.concurrency, MAX_CONCURRENCY));
  }
  if (patch.baseInterval !== undefined) (config as any).baseInterval = patch.baseInterval;
  if (patch.maxInterval !== undefined) (config as any).maxInterval = patch.maxInterval;
  logger.info(
    { concurrency: config.concurrency, baseInterval: config.baseInterval },
    '[TaskWorker] Config updated live',
  );
}

/**
 * Reset ALL tasks stuck in PROCESSING to PENDING on startup.
 * Called once at start() — handles server restart/crash recovery immediately,
 * no need to wait for staleThreshold timeout.
 */
export async function resetProcessingOnStartup(repo: PendingTaskRepository, logger: Logger): Promise<number> {
  const result = await repo.resetAllProcessing();
  if (result > 0) logger.info({ reset: result }, 'TaskWorker: reset stuck PROCESSING tasks on startup');
  return result;
}

/** Purge superseded COMPLETED tasks on startup to bound pending_tasks growth. */
export async function purgeSupersededOnStartup(repo: PendingTaskRepository, logger: Logger): Promise<number> {
  const purged = await repo.purgeSupersededCompleted();
  if (purged > 0) logger.info({ purged }, 'TaskWorker: purged superseded COMPLETED tasks on startup');
  return purged;
}

export async function recoverStaleTasks(repo: PendingTaskRepository, config: TaskWorkerConfig, logger: Logger): Promise<number> {
  const recovered = await repo.recoverStaleTasks(config.staleThreshold);
  if (recovered > 0) logger.info({ recovered }, 'Recovered stale tasks');
  return recovered;
}

export async function getWorkerStats(repo: PendingTaskRepository, isRunning: boolean, lastPollAt: string | null): Promise<TaskWorkerStats> {
  const dbStats = await repo.getStats();
  return { ...dbStats, isRunning, lastPollAt };
}

export async function handleTaskError(repo: PendingTaskRepository, task: PendingTask, err: Error): Promise<void> {
  const nonRetryable = err.message.includes('invalid_json')
    || err.message.includes('invalid_payload')
    || err.message.includes('entry_not_found')
    || err.message.includes('symbol_not_found');
  if (nonRetryable || task.retry_count + 1 >= task.max_retries) {
    await repo.markFailed(task.id, err.message);
  } else {
    await repo.markFailed(task.id, err.message);
    await repo.resetForRetry(task.id);
  }
}
