import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionConfigurator } from '../session-configurator';
import { ContextBudgetError } from '../../mcp/context-budget';

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

// STC: TC-001/TC-101 — registry query + model-not-found fallback with diagnostics
// STC: TC-002/TC-201/TC-202 — budget gate integration on createAgentSession
// STC: TC-302 — thinkingLevel -> maxTokens via SessionConfigurator

const mockSdk = () => ({
  SessionManager: { inMemory: vi.fn((cwd: string) => ({ cwd })) },
  createAgentSession: vi.fn((config: unknown) => ({ config })),
});

describe('SessionConfigurator budget gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-001: getModelMetadata returns phi-3-mini registry entry', () => {
    const meta = SessionConfigurator.getModelMetadata('phi-3-mini');
    expect(meta?.contextWindow).toBe(2048);
    expect(meta?.maxOutput).toBe(512);
  });

  it('TC-101: unknown model falls back to default with diagnostics log', () => {
    const sdk = mockSdk();
    SessionConfigurator.createAgentSession(sdk as any, '/ws', {
      model: 'unknown-model',
    });
    const config = sdk.createAgentSession.mock.calls[0][0];
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.diagnostics.model).toBe('gpt-4o-mini');
    expect(config.diagnostics.fallbackFrom).toBe('unknown-model');
    expect(logger.warn).toHaveBeenCalledWith(
      'Model not found, using default',
      expect.objectContaining({ requested: 'unknown-model' })
    );
  });

  it('TC-002: within-limit budget allows session creation and stores diagnostics', () => {
    const sdk = mockSdk();
    SessionConfigurator.createAgentSession(sdk as any, '/ws', {
      model: 'llama3.1',
      contextBudget: {
        systemPromptChars: 7500,
        toolSchemaTokens: 500,
        retrievalTokens: 300,
        historyTokens: 200,
      },
    });
    const config = sdk.createAgentSession.mock.calls[0][0];
    expect(config.model).toBe('llama3.1');
    expect(config.diagnostics.decision).toBe('ALLOW');
    expect(config.diagnostics.estimatedTokens).toBe(4875);
    expect(config.diagnostics.usagePercent).toBeCloseTo(59.5, 1);
    expect(config.diagnostics.contextWindow).toBe(8192);
  });

  it('TC-201: budget >95% rejects session before SDK call', () => {
    const sdk = mockSdk();
    expect(() =>
      SessionConfigurator.createAgentSession(sdk as any, '/ws', {
        model: 'smollm2-360m',
        contextBudget: { systemPromptChars: 7500, toolSchemaTokens: 500, retrievalTokens: 300, historyTokens: 200 },
      })
    ).toThrowError(ContextBudgetError);
    expect(sdk.createAgentSession).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Context budget rejected session creation',
      expect.anything()
    );
  });

  it('TC-202: budget >85% warns but still creates session', () => {
    const sdk = mockSdk();
    SessionConfigurator.createAgentSession(sdk as any, '/ws', {
      model: 'llama3.1',
      contextBudget: { systemPromptChars: 7500, toolSchemaTokens: 2000, retrievalTokens: 1500, historyTokens: 0 },
    });
    const config = sdk.createAgentSession.mock.calls[0][0];
    expect(config.diagnostics.decision).toBe('WARN');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('>85% threshold'), expect.anything());
  });

  it('TC-302: maps thinkingLevel high to maxTokens capped at maxOutput', () => {
    expect(SessionConfigurator.mapThinkingLevel('qwen2.5-coder', 'high')).toBe(1024);
    const cfg = SessionConfigurator.buildSessionConfig({ model: 'qwen2.5-coder', thinkingLevel: 'high' });
    expect(cfg.maxTokens).toBe(1024);
  });

  it('calculateBudget warns on conservative estimation (EF-1)', () => {
    SessionConfigurator.calculateBudget('gpt-4o-mini', {
      systemPromptChars: 7500,
      toolSchemaTokens: Number.NaN,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Context budget estimation error - conservative estimate used',
      expect.anything()
    );
  });
});
