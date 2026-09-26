import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRouter } from '../model-router';
import { DEFAULT_MODEL_REGISTRY } from '../model-registry';
import { DEFAULT_ROUTING_POLICY } from '../routing-policy';

vi.mock('../../logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../logger';

// STC: TC-001 / TC-701 — Small model first routing
// STC: TC-002 / TC-702 — Low confidence escalates to large
// STC: TC-003 / TC-703 — Routing decision logged
// STC: TC-102 / TC-302 — Easy questions stay small
// FSD 12.5 — Routing decision < 100ms

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new ModelRouter(DEFAULT_MODEL_REGISTRY, DEFAULT_ROUTING_POLICY);
  });

  it('TC-001/TC-701: routes request to small model first', () => {
    const decision = router.route('Explain this stack trace');
    expect(decision.modelId).toBe('phi-3-mini');
    expect(decision.tier).toBe('small');
    expect(decision.escalated).toBe(false);
  });

  it('TC-701: explicit modelId is routed and classified', () => {
    const decision = router.route('question', 'llama3.1');
    expect(decision.modelId).toBe('llama3.1');
    expect(decision.tier).toBe('small');
    const large = router.route('question', 'gpt-4o-mini');
    expect(large.tier).toBe('large');
  });

  it('TC-003/TC-703: routing decision is logged', () => {
    router.route('any query');
    expect(logger.info).toHaveBeenCalledWith('Routing decision', expect.objectContaining({ modelId: 'phi-3-mini' }));
  });

  it('ROUTE_ERROR: unknown model keeps original', () => {
    const decision = router.route('query', 'unknown-model');
    expect(decision.modelId).toBe('unknown-model');
    expect(decision.reason).toContain('ROUTE_ERROR');
    expect(decision.escalated).toBe(false);
  });

  it('TC-002/TC-702: low-confidence answer triggers escalation', () => {
    const decision = router.shouldEscalate('{"confidence": 0.62}', { modelId: 'phi-3-mini', escalationCount: 0 });
    expect(decision.escalate).toBe(true);
    expect(decision.confidence).toBe(0.62);
    expect(decision.reason).toContain('0.62 < threshold 0.75');
  });

  it('TC-102/TC-302: easy confident answer stays on small model', () => {
    const decision = router.shouldEscalate('The answer is 42', { modelId: 'phi-3-mini', escalationCount: 0 });
    expect(decision.escalate).toBe(false);
    expect(decision.confidence).toBe(0.9);
  });

  it('max escalations reached: low confidence no longer escalates', () => {
    const decision = router.shouldEscalate('{"confidence": 0.62}', { modelId: 'phi-3-mini', escalationCount: 1 });
    expect(decision.escalate).toBe(false);
    expect(decision.reason).toBe('max escalations reached for session');
  });

  it('FSD 12.5: routing decision completes under 100ms', () => {
    const started = performance.now();
    for (let i = 0; i < 100; i++) {
      router.route(`query number ${i}`);
    }
    const avgMs = (performance.now() - started) / 100;
    expect(avgMs).toBeLessThan(100);
  });
});
