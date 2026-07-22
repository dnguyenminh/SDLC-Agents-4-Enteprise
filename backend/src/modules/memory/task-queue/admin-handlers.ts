/**
 * Admin Handlers — SA4E-44
 * Diagnostic endpoint handlers for the task queue.
 * SA4E-53: converted to async API.
 */

import type { TaskWorker } from './TaskWorker.js';

export async function getTaskStats(worker: TaskWorker) {
  return worker.getStats();
}

export async function getFailedTasks(worker: TaskWorker, limit = 20) {
  return { tasks: await worker.getRepository().listFailed(limit) };
}

export async function retryTask(worker: TaskWorker, taskId: number) {
  const task = await worker.getRepository().findById(taskId);
  if (!task) return { ok: false, error: 'task_not_found' };
  if (task.status !== 'FAILED') return { ok: false, error: 'task_not_failed' };
  await worker.getRepository().resetForRetry(taskId);
  return { ok: true, new_status: 'PENDING' };
}
