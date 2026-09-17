import { describe, it, expect, vi } from 'vitest';
import { PiAgentExecutor } from '../pi-agent-executor';
import type { PiProvider } from '../pi-provider';

function createMockProvider(chunks: any[]) {
  const provider: PiProvider = {
    providerName: 'PiProvider',
    initialize: vi.fn().mockResolvedValue(undefined),
    createAgent: vi.fn().mockResolvedValue({
      sessionId: 'pi_sess_1',
      id: 'agent-1',
      stream: async function* () { for (const c of chunks) yield c; },
      handleToolUse: vi.fn(),
    }),
    stream: async function* () { for (const c of chunks) yield c; },
    handleToolUse: vi.fn(),
  } as unknown as PiProvider;
  return provider;
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
};

describe('PiAgentExecutor - unit', () => {
  it('validates ticketKey', async () => {
    const provider = createMockProvider([]);
    const exec = new PiAgentExecutor(provider, mockLogger as any);
    const res = await exec.executeTurn({
      ticketKey: 'invalid',
      sessionId: 's1',
      agentId: 'a1',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.error?.code).toBe('INVALID_INPUT');
  });

  it('executes single turn no tool', async () => {
    const provider = createMockProvider([
      { type: 'text', content: 'Hello' },
      { type: 'done' },
    ]);
    const exec = new PiAgentExecutor(provider, mockLogger as any);
    const res = await exec.executeTurn({
      ticketKey: 'SA4E-291',
      sessionId: 's1',
      agentId: 'ba-agent',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(res.error).toBeUndefined();
    expect(res.messages.length).toBe(2);
    expect(res.toolCalls).toEqual([]);
    expect(res.streamChunks.length).toBe(2);
  });

  it('normalizes tool_use', async () => {
    const provider = createMockProvider([
      { type: 'tool_use', toolCall: { id: 't1', name: 'search', arguments: { q: 'x' } } },
      { type: 'done' },
    ]);
    const exec = new PiAgentExecutor(provider, mockLogger as any);
    const res = await exec.executeTurn({
      ticketKey: 'SA4E-291',
      sessionId: 's1',
      agentId: 'ba-agent',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(res.toolCalls.length).toBe(1);
    expect(res.toolCalls[0].toolUseId).toBe('t1');
    expect(res.toolCalls[0].toolName).toBe('search');
  });

  it('handles provider error as PI_TIMEOUT', async () => {
    const provider: PiProvider = {
      providerName: 'PiProvider',
      initialize: vi.fn(),
      createAgent: vi.fn().mockRejectedValue(new Error('timeout')),
      stream: async function* () {},
      handleToolUse: vi.fn(),
    } as unknown as PiProvider;
    const exec = new PiAgentExecutor(provider, mockLogger as any);
    const res = await exec.executeTurn({
      ticketKey: 'SA4E-291',
      sessionId: 's1',
      agentId: 'ba-agent',
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(res.error?.code).toBe('PI_TIMEOUT');
  });
});
