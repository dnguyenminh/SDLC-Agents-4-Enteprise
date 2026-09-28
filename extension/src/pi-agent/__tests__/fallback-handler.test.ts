import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackHandler, RoutableSession } from '../fallback-handler';
import { DEFAULT_MODEL_REGISTRY } from '../model-registry';
import { DEFAULT_ROUTING_POLICY, RoutingPolicy } from '../routing-policy';
import { ThinkingLevelMapper } from '../thinking-level-mapper';

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

// STC: TC-301 — phi-3 fail escalates to gpt-4o-mini with log
// STC: TC-101 / TC-704 — thinkingLevel maps to maxTokens + retry config
// FSD 12.3 — max 1 escalation per session; FSD 12.5 — cost increase <= 30%

const makeSession = (overrides: Partial<RoutableSession> = {}): RoutableSession => ({
  modelId: 'phi-3-mini',
  thinkingLevel: 'medium',
  escalationCount: 0,
  diagnostics: [],
  ...overrides,
});

describe('FallbackHandler', () => {
  let handler: FallbackHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new FallbackHandler(DEFAULT_MODEL_REGISTRY, DEFAULT_ROUTING_POLICY, new ThinkingLevelMapper(DEFAULT_MODEL_REGISTRY));
  });

  it('TC-301: phi-3 failure escalates to gpt-4o-mini with log', () => {
    const escalated = handler.escalate(makeSession(), 'model-failure', 'provider returned 500');
    expect(escalated.modelId).toBe('gpt-4o-mini');
    expect(escalated.escalationCount).toBe(1);
    expect(escalated.config?.model).toBe('gpt-4o-mini');
    expect(escalated.config?.retry).toEqual({ maxRetries: 1 });
    expect(escalated.diagnostics).toHaveLength(1);
    expect(escalated.diagnostics[0]).toMatchObject({
      from: 'phi-3-mini',
      to: 'gpt-4o-mini',
      reason: expect.stringContaining('provider returned 500'),
    });
    expect(logger.info).toHaveBeenCalledWith(
      'Escalated session to large model',
      expect.objectContaining({ from: 'phi-3-mini', to: 'gpt-4o-mini' })
    );
  });

  it('TC-101/TC-704: thinkingLevel high maps maxTokens for escalation model', () => {
    const escalated = handler.escalate(makeSession({ thinkingLevel: 'high' }), 'low-confidence', 'confidence 0.3');
    expect(escalated.config?.maxTokens).toBe(16384);
  });

  it('TC-101/TC-704: thinkingLevel low maps smaller maxTokens', () => {
    const escalated = handler.escalate(makeSession({ thinkingLevel: 'low' }), 'low-confidence', 'confidence 0.3');
    expect(escalated.config?.maxTokens).toBe(4096);
  });

  it('blocks escalation after reaching max escalations per session', () => {
    const blocked = handler.escalate(makeSession({ escalationCount: 1 }), 'low-confidence', 'confidence 0.4');
    expect(blocked.modelId).toBe('phi-3-mini');
    expect(blocked.escalationCount).toBe(1);
    expect(blocked.diagnostics[0].reason).toContain('max escalations reached');
    expect(logger.warn).toHaveBeenCalledWith('Escalation blocked', expect.anything());
  });

  it('blocks escalation when cost increase exceeds the 30% ceiling', () => {
    const policy: RoutingPolicy = { ...DEFAULT_ROUTING_POLICY, escalationModel: 'gpt-4o' };
    const costly = new FallbackHandler(DEFAULT_MODEL_REGISTRY, policy, new ThinkingLevelMapper(DEFAULT_MODEL_REGISTRY));
    const blocked = costly.escalate(makeSession(), 'low-confidence', 'confidence 0.4');
    expect(blocked.modelId).toBe('phi-3-mini');
    expect(blocked.diagnostics[0].reason).toContain('cost increase exceeds 30% ceiling');
  });

  it('ESCALATE_FAIL: escalation error keeps original session and logs', () => {
    const failingMapper = {
      map: () => {
        throw new Error('mapper boom');
      },
    } as unknown as ThinkingLevelMapper;
    const failing = new FallbackHandler(DEFAULT_MODEL_REGISTRY, DEFAULT_ROUTING_POLICY, failingMapper);
    const result = failing.escalate(makeSession(), 'model-failure', 'provider 500');
    expect(result.modelId).toBe('phi-3-mini');
    expect(result.diagnostics[0].reason).toContain('ESCALATE_FAIL: mapper boom');
    expect(logger.error).toHaveBeenCalledWith('ESCALATE_FAIL - keeping original session', expect.anything());
  });
});
