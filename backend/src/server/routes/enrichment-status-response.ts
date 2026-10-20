/**
 * SA4E-157 — Enrichment status response builder.
 * Extracted from enrichment-status-routes.ts: aggregates TaskWorker progress,
 * project-scoped stats, ETA (BR-08), active tasks and recent failures.
 */

import { deriveEnrichmentState } from '../../shared/schemas/EnrichmentStatusSchema.js';
import type { EnrichmentStatusResponse } from '../../shared/schemas/EnrichmentStatusSchema.js';
import type { TaskWorker } from '../../modules/memory/task-queue/TaskWorker.js';
type PendingTaskRepository =
  InstanceType<typeof import('../../modules/memory/task-queue/PendingTaskRepository.js').PendingTaskRepository>;

/** Build the full enrichment status response from TaskWorker data, scoped to project. */
export async function buildStatusResponse(taskWorker: TaskWorker, projectId: string | null): Promise<EnrichmentStatusResponse & { activeTasks: Array<{ source: string }>; recentFailures: Array<{ symbolName: string; error: string; taskId: number }> }> {
  const repo = taskWorker.getRepository();
  const progress = await taskWorker.getProgress();
  const rawStats = projectId
    ? await repo.getStatsByProject(projectId)
    : await taskWorker.getStats();
  const startedAt = await repo.getEarliestActiveTimestamp();
  const stats = normalizeStats(rawStats);

  const state = deriveEnrichmentState(stats);
  const total = stats.pending + stats.processing + stats.completed + stats.failed;
  // BR-02: percent = completed / total * 100 (floor to avoid showing 100% when not truly done)
  const percent = total > 0 ? Math.floor((stats.completed / total) * 100) : 0;
  const estimatedCompletion = computeEstimatedCompletion(stats.completed, total, startedAt);

  return {
    state,
    projectId: projectId || null,
    totalRules: total,
    completedRules: stats.completed,
    failedRules: stats.failed,
    pendingRules: stats.pending,
    processingRules: stats.processing,
    percent,
    isRunning: stats.isRunning,
    startedAt,
    estimatedCompletion,
    currentFile: progress?.file ?? null,
    lastPollAt: stats.lastPollAt,
    maxConcurrency: taskWorker.getConcurrency(),
    activeConcurrency: stats.processing,
    activeTasks: await getActiveTasks(repo, projectId ?? undefined),
    recentFailures: await getRecentFailures(repo),
  };
}

/** PostgreSQL COUNT returns bigint as string — ensure numbers. */
function normalizeStats(rawStats: Record<string, unknown>): {
  pending: number; processing: number; completed: number; failed: number;
  isRunning: boolean; lastPollAt: string | null;
} {
  return {
    pending: Number(rawStats.pending) || 0,
    processing: Number(rawStats.processing) || 0,
    completed: Number(rawStats.completed) || 0,
    failed: Number(rawStats.failed) || 0,
    isRunning: (rawStats as any).isRunning ?? (Number(rawStats.processing) > 0 || Number(rawStats.pending) > 0),
    lastPollAt: (rawStats as any).lastPollAt ?? null,
  };
}

/**
 * Compute estimated completion time (BR-08).
 * Only meaningful when completedRules >= 10 (avoids wild extrapolation).
 */
function computeEstimatedCompletion(
  completed: number, total: number, startedAt: string | null,
): string | null {
  if (!startedAt || completed < 10 || total === 0) return null;
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) return null;
  const now = Date.now();
  const elapsed = now - start;
  if (elapsed <= 0) return null;
  const msPerTask = elapsed / completed;
  const remaining = total - completed;
  const etaMs = now + msPerTask * remaining;
  if (!isFinite(etaMs)) return null;
  return new Date(etaMs).toISOString();
}

/** Get currently processing tasks for tooltip display, scoped by project. */
async function getActiveTasks(
  repo: PendingTaskRepository,
  projectId?: string,
): Promise<Array<{ source: string }>> {
  try {
    // Show enough rows to cover higher concurrency configs (was 5).
    const tasks = await repo.listProcessing(64, projectId);
    return tasks.map((t) => ({ source: t.source }));
  } catch {
    return [];
  }
}

/** Get recent failed tasks with error messages for dashboard display. */
async function getRecentFailures(
  repo: PendingTaskRepository,
): Promise<Array<{ symbolName: string; error: string; taskId: number }>> {
  try {
    const tasks = await repo.listFailed(10);
    return tasks.map((t) => {
      const payload = typeof t.payload === 'string' ? JSON.parse(t.payload) : t.payload;
      return {
        taskId: t.id,
        symbolName: payload?.symbolName || payload?.filePath || `entry-${t.entry_id}`,
        error: (t as any).error || 'Unknown error',
      };
    });
  } catch {
    return [];
  }
}
