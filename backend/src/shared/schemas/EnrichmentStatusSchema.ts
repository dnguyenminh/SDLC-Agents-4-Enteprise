/**
 * SA4E-157 — Enrichment Status Zod Schema.
 * Defines the response shape for GET /api/v1/enrichment/status.
 * Shared type export for backend route handler.
 */

import { z } from 'zod';

/** Enrichment state enum — derived from task counts (BR-01). */
export const EnrichmentStateEnum = z.enum(['idle', 'running', 'complete', 'error']);

/** Full response schema for enrichment status endpoint. */
export const EnrichmentStatusResponseSchema = z.object({
  state: EnrichmentStateEnum,
  projectId: z.string().nullable(),
  totalRules: z.number().int().min(0),
  completedRules: z.number().int().min(0),
  failedRules: z.number().int().min(0),
  pendingRules: z.number().int().min(0),
  processingRules: z.number().int().min(0),
  percent: z.number().int().min(0).max(100),
  isRunning: z.boolean(),
  startedAt: z.string().nullable(),
  estimatedCompletion: z.string().nullable(),
  currentFile: z.string().nullable(),
  lastPollAt: z.string().nullable(),
  activeTasks: z.array(z.object({ source: z.string() })).optional(),
  recentFailures: z.array(z.object({ symbolName: z.string(), error: z.string(), taskId: z.number() })).optional(),
});

export type EnrichmentStatusResponse = z.infer<typeof EnrichmentStatusResponseSchema>;
export type EnrichmentState = z.infer<typeof EnrichmentStateEnum>;

/**
 * Derive enrichment state from task counts (BR-01).
 * @param stats Task count statistics from PendingTaskRepository
 * @returns Computed enrichment state
 */
export function deriveEnrichmentState(
  stats: { pending: number; processing: number; completed: number; failed: number },
): EnrichmentState {
  const { pending, processing, completed, failed } = stats;
  // All zero → idle (no enrichment ever queued or all cleaned)
  if (pending === 0 && processing === 0 && completed === 0 && failed === 0) return 'idle';
  // Active work → running
  if (pending > 0 || processing > 0) return 'running';
  // Done with failures → error
  if (failed > 0) return 'error';
  // Done, no failures → complete
  return 'complete';
}
