import { describe, it, expect, beforeEach } from 'vitest';
import { PhaseRouter } from '../phase-router.js';

describe('PhaseRouter (SA4E-292)', () => {
  let router: PhaseRouter;

  beforeEach(() => {
    router = new PhaseRouter();
  });

  it('should return INVALID_INTENT error for bad intent schema', async () => {
    const result = await router.routePhase(
      { currentPhase: 'requirements' },
      { action: 'invalid_action' as any }
    );
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('INVALID_INTENT');
  });

  it('should return UNKNOWN_PHASE error when current phase is invalid', async () => {
    const result = await router.routePhase(
      { currentPhase: 'invalid_phase' },
      { action: 'proceed' }
    );
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('UNKNOWN_PHASE');
  });

  it('should advance to next sequential phase when action is proceed', async () => {
    const result = await router.routePhase(
      { currentPhase: 'requirements' },
      { action: 'proceed' }
    );
    expect(result.errors.length).toBe(0);
    expect(result.nextPhase).toBe('specification');
    expect(result.updatedState.currentPhase).toBe('specification');
  });

  it('should route directly to targetPhase when targetPhase is provided', async () => {
    const result = await router.routePhase(
      { currentPhase: 'requirements' },
      { action: 'proceed', targetPhase: 'implementation' }
    );
    expect(result.errors.length).toBe(0);
    expect(result.nextPhase).toBe('implementation');
    expect(result.updatedState.currentPhase).toBe('implementation');
  });

  it('should halt workflow when action is abort or reject', async () => {
    const result = await router.routePhase(
      { currentPhase: 'design' },
      { action: 'abort', reason: 'User requested abort' }
    );
    expect(result.errors.length).toBe(0);
    expect(result.nextPhase).toBe('design');
    expect(result.updatedState.pipelineStatus).toBe('HALTED');
    expect(result.updatedState.haltReason).toBe('User requested abort');
  });
});
