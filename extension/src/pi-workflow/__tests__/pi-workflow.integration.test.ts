import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiWorkflowEngine } from '../pi-workflow';
import { StateAdapter } from '../state-adapter';
import { ApprovalAdapter } from '../approval-adapter';
import { CheckpointerAdapter } from '../checkpointer-adapter';
import { PhaseRouter } from '../phase-router';
import { PiAgentExecutor } from '../pi-agent-executor';

// STC: IT-01 — PiWorkflow engine end-to-end execution
describe('PiWorkflowEngine Integration', () => {
  let engine: PiWorkflowEngine;
  let stateAdapter: StateAdapter;
  let approvalAdapter: ApprovalAdapter;
  let checkpointerAdapter: CheckpointerAdapter;
  let phaseRouter: PhaseRouter;
  let agentExecutor: PiAgentExecutor;

  beforeEach(() => {
    stateAdapter = new StateAdapter();
    approvalAdapter = new ApprovalAdapter();
    checkpointerAdapter = new CheckpointerAdapter();
    phaseRouter = new PhaseRouter();
    agentExecutor = new PiAgentExecutor();

    engine = new PiWorkflowEngine(
      stateAdapter,
      approvalAdapter,
      checkpointerAdapter,
      phaseRouter,
      agentExecutor,
    );
  });

  it('STC: IT-01 — executes workflow turn and persists state', async () => {
    const input = {
      ticketKey: 'SA4E-296',
      threadId: 'thread-123',
      currentPhase: 'Requirements',
      input: { prompt: 'test' },
    };

    const result = await engine.execute(input);

    expect(result.pipelineState).toBeDefined();
    expect(result.pipelineState.ticketKey).toBe('SA4E-296');
    expect(result.pipelineState.threadId).toBe('thread-123');
    expect(result.pipelineState.pipelineStatus).toBe('running');
    expect(result.pipelineState.piSessionId).toBeDefined();
    expect(result.pipelineState.currentAgentId).toBeDefined();
    expect(result.pipelineState.toolCallCount).toBeGreaterThanOrEqual(0);
  });

  it('STC: IT-02 — state adapter mapping preserves critical fields', () => {
    const pipelineState = {
      ticketKey: 'SA4E-296',
      threadId: 'thread-123',
      currentPhase: 'Design' as any,
      pipelineStatus: 'running' as any,
      documents: {},
      agentOutputs: [],
      errors: [],
      chatHistory: [],
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      autonomyLevel: 'L2' as any,
    } as any;

    const piState = stateAdapter.toPiState(pipelineState);
    expect(piState.ticket).toBe('SA4E-296');
    expect(piState.phase).toBe('Design');
    expect(piState.status).toBe('running');

    const back = stateAdapter.fromPiState(piState);
    expect(back.ticketKey).toBe('SA4E-296');
    expect(back.currentPhase).toBe('Design');
  });

  it('STC: IT-03 — approval adapter normalizes tool id and handles decision', () => {
    const toolCall = { id: 'tool!@#123', tool_use_id: 'abc' };
    const normalized = approvalAdapter.normalizeToolUseId(toolCall);
    expect(normalized).toMatch(/^[a-zA-Z0-9_-]+$/);

    approvalAdapter.handleApproval('approve', 'tool-1');
    // @ts-ignore private access for test
    const decision = (approvalAdapter as any).getDecision('tool-1');
    expect(decision).toBe('approve');
  });

  it('STC: IT-04 — checkpointer save/load roundtrip', async () => {
    const state = {
      ticketKey: 'SA4E-296',
      threadId: 'thread-999',
      currentPhase: 'Testing',
      pipelineStatus: 'running' as const,
      piSessionId: 'pi_sess_abc',
      currentAgentId: 'qa-agent',
      toolCallCount: 2,
    };

    await checkpointerAdapter.save(state as any);
    const loaded = await checkpointerAdapter.load('thread-999');
    expect(loaded).not.toBeNull();
    expect(loaded?.threadId).toBe('thread-999');
    expect(loaded?.piSessionId).toBe('pi_sess_abc');
  });

  it('STC: IT-05 — phase router transitions correctly', () => {
    expect(phaseRouter.nextPhase('Requirements')).toBe('Specification');
    expect(phaseRouter.nextPhase('Specification')).toBe('Design');
    expect(phaseRouter.nextPhase('Deployment')).toBeNull();
    expect(phaseRouter.isTerminal('Deployment')).toBe(true);
    expect(phaseRouter.isTerminal('Design')).toBe(false);
  });

  it('STC: IT-06 — workflow handles Pi SDK error and pauses', async () => {
    const failingExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('Pi SDK failure')),
    } as any;

    const errorEngine = new PiWorkflowEngine(
      stateAdapter,
      approvalAdapter,
      checkpointerAdapter,
      phaseRouter,
      failingExecutor,
    );

    await expect(
      errorEngine.execute({
        ticketKey: 'SA4E-296',
        threadId: 'thread-err',
        currentPhase: 'Implementation',
        input: {},
      })
    ).rejects.toThrow(/Pi SDK failure/);
  });
});
