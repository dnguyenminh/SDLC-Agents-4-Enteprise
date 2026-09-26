import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiProvider } from '../pi-provider.js';

describe('PiProvider (SA4E-290)', () => {
  let provider: PiProvider;

  beforeEach(async () => {
    provider = new PiProvider();
    // Mock run() contract (real Agent runtime covered by pi-provider-runtime-smoke.test.ts)
    vi.spyOn(provider, 'run').mockResolvedValue({
      text: 'Mocked stream text',
      toolCalls: [],
      chunks: [{ type: 'text', content: 'Mocked stream text' }, { type: 'done' }],
      messages: [{ role: 'assistant', content: 'Mocked stream text' }],
    });
  });

  it('should have providerName set to PiProvider', () => {
    expect(provider.providerName).toBe('PiProvider');
  });

  it('should throw error when initializing with invalid transportType', async () => {
    await expect(provider.initialize({ transportType: 'INVALID' as any })).rejects.toThrow(
      'PI_CONFIG_INVALID: Invalid transport type'
    );
  });

  it('should initialize successfully with WebSocket transport', async () => {
    await expect(provider.initialize({ transportType: 'WebSocket' })).resolves.toBeUndefined();
  });

  it('should initialize successfully with HTTP transport', async () => {
    await expect(provider.initialize({ transportType: 'HTTP' })).resolves.toBeUndefined();
  });

  it('should throw PI_NOT_INITIALIZED when operations called before init', async () => {
    await expect(provider.createAgent('agent-1')).rejects.toThrow('PI_NOT_INITIALIZED');
  });

  it('should throw PI_AGENT_CREATE_FAILED when agentId is empty', async () => {
    await provider.initialize({ transportType: 'HTTP' });
    await expect(provider.createAgent('')).rejects.toThrow('PI_AGENT_CREATE_FAILED');
  });

  it('should create an agent instance when initialized', async () => {
    await provider.initialize({ transportType: 'HTTP' });
    const agent = await provider.createAgent('ba-agent');
    expect(agent.agentId).toBe('ba-agent');
  });

  it('should stream response chunks when initialized', async () => {
    await provider.initialize({ transportType: 'WebSocket' });
    const chunks = [];
    for await (const chunk of provider.stream({ prompt: 'Hello Pi' })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].type).toBe('text');
  });

  it('should handle tool use when initialized', async () => {
    await provider.initialize({ transportType: 'HTTP' });
    const result = await provider.handleToolUse({
      id: 'tc-1',
      name: 'search_kb',
      arguments: { query: 'test' }
    });
    expect(result.toolCallId).toBe('tc-1');
    expect(result.result).toBeDefined();
  });

  it('fails closed when SDK missing in production mode', async () => {
    const origEnv = process.env.NODE_ENV;
    const origVitest = process.env.VITEST;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;

      await provider.initialize({ transportType: 'HTTP' });

      // If SDK module is not loaded (or stub), createAgent must throw
      if (!provider.sdkAvailable) {
        await expect(provider.createAgent('ba-agent')).rejects.toThrow('PI_SDK_UNAVAILABLE');
      }
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.VITEST = origVitest;
    }
  });
});
