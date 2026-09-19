import { describe, it, expect, beforeEach } from 'vitest';
import { PiProvider } from '../pi-provider.js';

describe('PiProvider (SA4E-290)', () => {
  let provider: PiProvider;

  beforeEach(() => {
    provider = new PiProvider();
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
});
