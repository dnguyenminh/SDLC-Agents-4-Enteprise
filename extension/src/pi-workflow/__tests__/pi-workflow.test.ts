import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiWorkflowEngine } from '../pi-workflow.js';
import { PiProvider } from '../pi-provider.js';
import type { RemoteCheckpointerStore } from '../checkpointer-adapter.js';
import type { PipelineState } from '../types/pi-workflow-state.js';

function mockRunProvider(text = 'Mocked assistant response'): PiProvider {
  const provider = new PiProvider();
  vi.spyOn(provider, 'run').mockImplementation(async (input) => ({
    text,
    toolCalls: [],
    chunks: [{ type: 'text', content: text }, { type: 'done' }],
    messages: [
      { role: 'user', content: input.prompt },
      { role: 'assistant', content: text },
    ],
  }));
  return provider;
}

describe('PiWorkflowEngine Integration (SA4E-294/295)', () => {
  let engine: PiWorkflowEngine;
  let checkpoints: Record<string, PipelineState>;

  beforeEach(async () => {
    checkpoints = {};
    const mockStore: RemoteCheckpointerStore = {
      async getCheckpoint(id) {
        return checkpoints[id] || null;
      },
      async saveCheckpoint(id, cp) {
        checkpoints[id] = cp;
      }
    };

    engine = new PiWorkflowEngine({ remoteStore: mockStore, provider: mockRunProvider() });
    await engine.initialize('HTTP');
  });

  it('should execute turn and persist updated state to checkpointer', async () => {
    const initialState: PipelineState = {
      ticketKey: 'SA4E-294',
      threadId: 'th-100',
      currentPhase: 'requirements'
    };

    const { result, nextState } = await engine.executeTurn(initialState, 'Analyze requirements', 'ba-agent');

    expect(result.ticketKey).toBe('SA4E-294');
    expect(nextState.currentAgentId).toBe('ba-agent');
    expect(nextState.chatHistory?.length).toBeGreaterThan(0);
    expect(checkpoints['th-100']).toBeDefined();
    expect(checkpoints['th-100'].ticketKey).toBe('SA4E-294');
  });

  it('should transition phase deterministically and persist checkpoint', async () => {
    const initialState: PipelineState = {
      ticketKey: 'SA4E-294',
      threadId: 'th-200',
      currentPhase: 'requirements'
    };

    const { nextPhase, nextState } = await engine.transitionPhase(initialState, { action: 'proceed' });

    expect(nextPhase).toBe('specification');
    expect(nextState.currentPhase).toBe('specification');
    expect(checkpoints['th-200']).toBeDefined();
    expect(checkpoints['th-200'].currentPhase).toBe('specification');
  });

  it('should filter out rejected tool calls and record error in state', async () => {
    const mockGate = {
      async requestApproval(req: any) {
        if (req.toolName === 'rejected_tool') {
          return { approved: false, reason: 'Security rejection' };
        }
        return { approved: true };
      }
    };

    const customEngine = new PiWorkflowEngine({ gateHandler: mockGate, provider: mockRunProvider() });
    await customEngine.initialize('HTTP');

    // Simulate tool call execution
    const executor = (customEngine as any).executor;
    const origExecuteTurn = executor.executeTurn.bind(executor);
    executor.executeTurn = async (input: any) => {
      const res = await origExecuteTurn(input);
      res.toolCalls = [
        { id: 't1', name: 'rejected_tool', arguments: {} },
        { id: 't2', name: 'accepted_tool', arguments: {} }
      ];
      return res;
    };

    const state: PipelineState = { ticketKey: 'SA4E-289', threadId: 'th-rej', currentPhase: 'requirements' };
    const { result, nextState } = await customEngine.executeTurn(state, 'Run tools', 'dev-agent');

    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0].name).toBe('accepted_tool');
    expect(nextState.pipelineStatus).toBe('ERROR');
    expect(nextState.errors?.some(e => e.code === 'TOOL_APPROVAL_REJECTED')).toBe(true);
  });
});
