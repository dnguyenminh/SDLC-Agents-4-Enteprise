import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentExecutor } from '../pi-agent-executor.js';
import { PiProvider } from '../pi-provider.js';
import { normalizeToolCall } from '../utils/tool-normalizer.js';

describe('tool-normalizer', () => {
  it('should normalize raw tool calls with id, name, arguments', () => {
    const raw = { tool_use_id: 'tu-123', tool_name: 'search_code', input: { query: 'test' } };
    const normalized = normalizeToolCall(raw);
    expect(normalized.id).toBe('tu-123');
    expect(normalized.name).toBe('search_code');
    expect(normalized.arguments).toEqual({ query: 'test' });
  });
});

describe('PiAgentExecutor (SA4E-291) — provider.run() contract', () => {
  let provider: PiProvider;
  let executor: PiAgentExecutor;

  beforeEach(async () => {
    provider = new PiProvider();
    // Mock the run() contract (real Agent runtime is covered by pi-provider-runtime-smoke.test.ts)
    vi.spyOn(provider, 'run').mockResolvedValue({
      text: 'Mocked assistant response',
      toolCalls: [],
      chunks: [{ type: 'text', content: 'Mocked assistant response' }, { type: 'done' }],
      messages: [
        { role: 'user', content: 'Design architecture' },
        { role: 'assistant', content: 'Mocked assistant response' },
      ],
    });
    await provider.initialize({ transportType: 'HTTP' });
    executor = new PiAgentExecutor(provider);
  });

  it('should return INVALID_INPUT error for invalid ticketKey format', async () => {
    const result = await executor.executeTurn({
      ticketKey: 'invalid-key',
      sessionId: 'sess-1',
      agentId: 'ba-agent',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('should return INVALID_INPUT error when sessionId is empty', async () => {
    const result = await executor.executeTurn({
      ticketKey: 'SA4E-291',
      sessionId: '',
      agentId: 'ba-agent',
      messages: [{ role: 'user', content: 'Hello' }]
    });
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('should return INVALID_INPUT error when messages array is empty', async () => {
    const result = await executor.executeTurn({
      ticketKey: 'SA4E-291',
      sessionId: 'sess-1',
      agentId: 'ba-agent',
      messages: []
    });
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('should execute single turn successfully and append assistant message', async () => {
    const result = await executor.executeTurn({
      ticketKey: 'SA4E-291',
      sessionId: 'sess-1',
      agentId: 'ba-agent',
      messages: [{ role: 'user', content: 'Design architecture' }]
    });
    expect(result.error).toBeUndefined();
    expect(result.ticketKey).toBe('SA4E-291');
    expect(result.sessionId).toBe('sess-1');
    expect(result.messages.length).toBe(2);
    expect(result.messages[1].role).toBe('assistant');
    expect(result.streamChunks.length).toBeGreaterThan(0);
    expect(provider.run).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Design architecture',
      sessionId: 'sess-1',
    }));
  });
});
