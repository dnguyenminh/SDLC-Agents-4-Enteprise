/**
 * Unit tests for Pi Provider — SA4E-290
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiProviderImpl, ConfigurationError, PiInitError, createPiProvider } from '../pi-provider';

describe('PiProviderImpl', () => {
  let provider: PiProviderImpl;

  beforeEach(() => {
    provider = createPiProvider();
    // Mock dynamic import
    vi.stubGlobal('console', { error: vi.fn(), info: vi.fn() });
  });

  it('should initialize with valid WebSocket config', async () => {
    await provider.initialize({ transportType: 'WebSocket' });
    expect(provider).toBeDefined();
  });

  it('should initialize with valid HTTP config', async () => {
    await provider.initialize({ transportType: 'HTTP', baseUrl: 'http://localhost' });
    expect(provider).toBeDefined();
  });

  it('should throw ConfigurationError when transportType missing', async () => {
    await expect(provider.initialize({} as any)).rejects.toThrow(ConfigurationError);
  });

  it('should throw ConfigurationError for invalid transport', async () => {
    await expect(provider.initialize({ transportType: 'TCP' as any })).rejects.toThrow(ConfigurationError);
  });

  it('should create agent with valid agentId', async () => {
    await provider.initialize({ transportType: 'WebSocket' });
    const agent = await provider.createAgent('agent-1');
    expect(agent).toBeDefined();
    expect(agent.id).toBe('agent-1');
  });

  it('should throw when creating agent before initialize', async () => {
    await expect(provider.createAgent('agent-1')).rejects.toThrow(ConfigurationError);
  });

  it('should throw for empty agentId', async () => {
    await provider.initialize({ transportType: 'HTTP' });
    await expect(provider.createAgent('   ')).rejects.toThrow(ConfigurationError);
  });

  it('should stream from agent', async () => {
    await provider.initialize({ transportType: 'WebSocket' });
    await provider.createAgent('agent-1');
    const chunks: any[] = [];
    for await (const chunk of provider.stream({ agentId: 'agent-1', messages: [] })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].type).toBe('text');
  });

  it('should handle tool use', async () => {
    await provider.initialize({ transportType: 'WebSocket' });
    await provider.createAgent('agent-1');
    const result = await provider.handleToolUse({ id: 'call-1', name: 'test', arguments: {} });
    expect(result.toolCallId).toBe('call-1');
  });

  it('should throw PiInitError when streaming without agent', async () => {
    await provider.initialize({ transportType: 'HTTP' });
    await expect(async () => {
      for await (const _ of provider.stream({ agentId: 'x', messages: [] })) {}
    }).rejects.toThrow(PiInitError);
  });
});
