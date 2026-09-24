/**
 * SA4E-157 — Extension-side Enrichment Status Zod Schema.
 * Independent validation for API response crossing protocol boundary.
 * Mirrors backend schema — ensures defense-in-depth per code-standards.md.
 */

import { z } from 'zod';

/** Enrichment state enum values. */
export const EnrichmentStateEnum = z.enum(['idle', 'running', 'complete', 'error']);

/** Response schema — validated with safeParse before UI consumption. */
export const EnrichmentStatusResponseSchema = z.object({
  state: EnrichmentStateEnum,
  projectId: z.string().nullable().optional(),
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
  // Configured max parallel tasks (taskWorker.concurrency) + live processing count.
  // MUST be declared here — zod safeParse strips undeclared keys, which would
  // drop these fields before the dashboard reads them (falling back to 20).
  maxConcurrency: z.number().int().min(1).optional(),
  activeConcurrency: z.number().int().min(0).optional(),
  activeTasks: z.array(z.object({ source: z.string() })).optional(),
  recentFailures: z.array(z.object({ symbolName: z.string(), error: z.string(), taskId: z.number() })).optional(),
});

export type EnrichmentStatusResponse = z.infer<typeof EnrichmentStatusResponseSchema>;
export type EnrichmentState = z.infer<typeof EnrichmentStateEnum>;
