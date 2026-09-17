import { describe, it, expect } from 'vitest';
import { PhaseRouter, IntentSchema } from '../phase-router';
import type { PiWorkflowState } from '../types/pi-workflow-state';

describe('PhaseRouter', () => {
  const router = new PhaseRouter();

  const baseState = (overrides: Partial<PiWorkflowState> = {}): PiWorkflowState => ({
    ticketKey: 'SA4E-292',
    threadId: 'thread-1',
    currentPhase: 'requirements',
    pipelineStatus: 'running',
    chatHistory: [],
    agentOutputs: {},
    errors: [],
    ...overrides,
  });

  it('nextPhase returns next in order', () => {
    expect(router.nextPhase('requirements')).toBe('Specification');
    expect(router.nextPhase('design')).toBe('Test_planning');
    expect(router.nextPhase('deployment')).toBeNull();
    expect(router.nextPhase('unknown')).toBeNull();
  });

  it('isTerminal detects deployment', () => {
    expect(router.isTerminal('deployment')).toBe(true);
    expect(router.isTerminal('testing')).toBe(false);
  });

  it('classifyIntent parses phase_change with heuristic', () => {
    const intent = router.classifyIntent('Please move to specification phase');
    expect(intent.type).toBe('phase_change');
    expect(intent.target).toBe('specification');
  });

  it('classifyIntent returns finish for finish keywords', () => {
    const intent = router.classifyIntent('Finish the workflow now');
    expect(intent.type).toBe('finish');
  });

  it('classifyIntent returns continue by default', () => {
    const intent = router.classifyIntent('continue');
    expect(intent.type).toBe('continue');
  });

  it('routePhase with valid phase_change moves to target', () => {
    const state = baseState({ currentPhase: 'requirements' });
    const intent = { type: 'phase_change' as const, target: 'design' };
    const result = router.routePhase(state, intent);
    expect(result.nextPhase).toBe('design');
    expect(result.updatedState.currentPhase).toBe('design');
    expect(result.errors).toHaveLength(0);
  });

  it('routePhase with continue advances to next phase', () => {
    const state = baseState({ currentPhase: 'specification' });
    const intent = { type: 'continue' as const };
    const result = router.routePhase(state, intent);
    expect(result.nextPhase).toBe('Design');
  });

  it('routePhase with finish returns finish', () => {
    const state = baseState({ currentPhase: 'testing' });
    const intent = { type: 'finish' as const };
    const result = router.routePhase(state, intent);
    expect(result.nextPhase).toBe('finish');
  });

  it('routePhase with invalid intent schema returns current phase unchanged', () => {
    const state = baseState({ currentPhase: 'requirements' });
    // @ts-ignore intentional invalid
    const intent = { type: 'invalid', confidence: 2 };
    const result = router.routePhase(state as any, intent as any);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.nextPhase).toBeNull();
  });

  it('routePhase with unknown phase triggers error', () => {
    const state = baseState({ currentPhase: 'unknown_phase' });
    const intent = { type: 'continue' as const };
    const result = router.routePhase(state, intent);
    expect(result.errors.some(e => e.includes('Unknown phase'))).toBe(true);
    expect(result.nextPhase).toBeNull();
  });

  it('routePhase manual_review sets error and null nextPhase', () => {
    const state = baseState();
    const intent = { type: 'manual_review' as const };
    const result = router.routePhase(state, intent);
    expect(result.nextPhase).toBeNull();
    expect(result.errors).toContain('Manual review required');
  });

  it('IntentSchema validates correctly', () => {
    const valid = IntentSchema.safeParse({ type: 'continue', confidence: 0.5 });
    expect(valid.success).toBe(true);

    const invalid = IntentSchema.safeParse({ type: 'continue', confidence: 2 });
    expect(invalid.success).toBe(false);
  });
});
