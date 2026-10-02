import { describe, it, expect, vi } from 'vitest';
import { PiAgentExecutor } from '../pi-agent-executor.js';
import { PiWorkflowEngine } from '../pi-workflow.js';
import { PiProvider } from '../pi-provider.js';
import type { PiRunInput } from '../pi-provider.js';

function mockRunProvider(captured: { input?: PiRunInput }) {
  const provider = new PiProvider();
  vi.spyOn(provider, 'run').mockImplementation(async (input) => {
    captured.input = input;
    return {
      text: 'done',
      toolCalls: [],
      chunks: [{ type: 'done' }],
      messages: [{ role: 'user', content: input.prompt }],
    };
  });
  return provider;
}

describe('onToolEvent threading (live progress)', () => {
  it('executor forwards onToolEvent into PiRunInput', async () => {
    const captured: { input?: PiRunInput } = {};
    const executor = new PiAgentExecutor(mockRunProvider(captured) as never);
    const onToolEvent = vi.fn();
    await executor.executeTurn({
      ticketKey: 'SA4E-1',
      sessionId: 's1',
      agentId: 'sm-agent',
      messages: [{ role: 'user', content: 'hi' }],
      onToolEvent: onToolEvent as never,
    });
    expect(captured.input?.onToolEvent).toBe(onToolEvent);
  });

  it('engine forwards turnOpts.onToolEvent to the executor', async () => {
    const captured: { input?: PiRunInput } = {};
    const engine = new PiWorkflowEngine({ provider: mockRunProvider(captured) as never });
    await engine.initialize('HTTP');
    const onToolEvent = vi.fn();
    const state = { ticketKey: 'SA4E-1', piSessionId: 's1', chatHistory: [] } as never;
    await engine.executeTurn(state, 'hi', 'sm-agent', { onToolEvent: onToolEvent as never });
    expect(captured.input?.onToolEvent).toBe(onToolEvent);
  });
});
