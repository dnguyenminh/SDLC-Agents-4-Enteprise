/**
 * SA4E-157 — Unit tests for EnrichmentStatusSchema.
 * Covers deriveEnrichmentState (BR-01) and EnrichmentStatusResponseSchema validation.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveEnrichmentState,
  EnrichmentStatusResponseSchema,
  EnrichmentStateEnum,
} from '../EnrichmentStatusSchema.js';

describe('deriveEnrichmentState (BR-01)', () => {
  it('returns idle when all counts are zero', () => {
    expect(deriveEnrichmentState({ pending: 0, processing: 0, completed: 0, failed: 0 })).toBe('idle');
  });

  it('returns running when there are pending tasks', () => {
    expect(deriveEnrichmentState({ pending: 5, processing: 0, completed: 0, failed: 0 })).toBe('running');
  });

  it('returns running when there are processing tasks', () => {
    expect(deriveEnrichmentState({ pending: 0, processing: 3, completed: 10, failed: 0 })).toBe('running');
  });

  it('returns error when done with failures but no active work', () => {
    expect(deriveEnrichmentState({ pending: 0, processing: 0, completed: 10, failed: 2 })).toBe('error');
  });

  it('returns complete when done with no failures and no active work', () => {
    expect(deriveEnrichmentState({ pending: 0, processing: 0, completed: 10, failed: 0 })).toBe('complete');
  });

  it('prioritises running over error when active tasks exist alongside failures', () => {
    expect(deriveEnrichmentState({ pending: 1, processing: 0, completed: 10, failed: 2 })).toBe('running');
  });
});

describe('EnrichmentStatusResponseSchema', () => {
  const validResponse = {
    state: 'running' as const,
    projectId: null,
    totalRules: 100,
    completedRules: 40,
    failedRules: 2,
    pendingRules: 50,
    processingRules: 8,
    percent: 40,
    isRunning: true,
    startedAt: '2026-01-01T00:00:00.000Z',
    estimatedCompletion: null,
    currentFile: 'src/a.ts',
    lastPollAt: null,
  };

  it('accepts a well-formed running response', () => {
    const parsed = EnrichmentStatusResponseSchema.safeParse(validResponse);
    expect(parsed.success).toBe(true);
  });

  it('rejects a negative count', () => {
    const parsed = EnrichmentStatusResponseSchema.safeParse({ ...validResponse, completedRules: -1 });
    expect(parsed.success).toBe(false);
  });

  it('rejects percent outside 0..100', () => {
    const over = EnrichmentStatusResponseSchema.safeParse({ ...validResponse, percent: 150 });
    const under = EnrichmentStatusResponseSchema.safeParse({ ...validResponse, percent: -5 });
    expect(over.success).toBe(false);
    expect(under.success).toBe(false);
  });

  it('rejects an invalid state enum value', () => {
    const parsed = EnrichmentStatusResponseSchema.safeParse({ ...validResponse, state: 'frobnicated' });
    expect(parsed.success).toBe(false);
  });

  it('accepts a string projectId', () => {
    const parsed = EnrichmentStatusResponseSchema.safeParse({ ...validResponse, projectId: 'proj-1' });
    expect(parsed.success).toBe(true);
  });

  it('exposes the four valid state enum members', () => {
    expect(EnrichmentStateEnum.options.sort()).toEqual(['complete', 'error', 'idle', 'running']);
  });
});
