/**
 * Admin Handlers — SA4E-44
 * Diagnostic endpoint handlers for the task queue.
 */

import type { TaskWorker } from './TaskWorker.js';

export function getTaskStats(worker: TaskWorker) {
  return worker.getStats();
}

export function getFailedTasks(worker: TaskWorker, limit = 20) {
  return { tasks: worker.getRepository().listFailed(limit) };
}

export function retryTask(worker: TaskWorker, taskId: number) {
  const task = worker.getRepository().findById(taskId);
  if (!task) return { ok: false, error: 'task_not_found' };
  if (task.status !== 'FAILED') return { ok: false, error: 'task_not_failed' };
  worker.getRepository().resetForRetry(taskId);
  return { ok: true, new_status: 'PENDING' };
}
