import { describe, it, expect } from 'vitest';
import { PiAgentExecutor } from '../pi-agent-executor';
import { PiProviderImpl } from '../pi-provider';

describe('PiAgentExecutor - integration', () => {
  it('executes turn with real provider stub', async () => {
    const provider = new PiProviderImpl();
    await provider.initialize({ transportType: 'HTTP' });
    await provider.createAgent('agent-1');
    const exec = new PiAgentExecutor(provider);
    const res = await exec.executeTurn({
      ticketKey: 'SA4E-291',
      sessionId: 'sess-1',
      agentId: 'agent-1',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(res.ticketKey).toBe('SA4E-291');
    expect(res.sessionId).toBe('sess-1');
    expect(res.agentId).toBe('agent-1');
    expect(res.error).toBeUndefined();
    expect(res.streamChunks.length).toBeGreaterThan(0);
    expect(res.toolCallCount).toBe(0);
  });
});
