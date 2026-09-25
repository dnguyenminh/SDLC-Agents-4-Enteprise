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
