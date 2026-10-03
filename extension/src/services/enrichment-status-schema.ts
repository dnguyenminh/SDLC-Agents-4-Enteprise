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

/** A single failed enrichment task with resolved source + stored error. */
export const EnrichmentFailureSchema = z.object({
  id: z.number().int(),
  source: z.string(),
  error: z.string().nullable(),
  retryCount: z.number().int().min(0),
  completedAt: z.string().nullable(),
});

/** Response schema for GET /api/v1/enrichment/failures — validated before UI consumption. */
export const EnrichmentFailuresResponseSchema = z.object({
  projectId: z.string().nullable(),
  count: z.number().int().min(0),
  limit: z.number().int().min(1),
  failures: z.array(EnrichmentFailureSchema),
});

export type EnrichmentFailure = z.infer<typeof EnrichmentFailureSchema>;
export type EnrichmentFailuresResponse = z.infer<typeof EnrichmentFailuresResponseSchema>;
