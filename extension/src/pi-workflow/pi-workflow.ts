import { StateAdapter, IStateAdapter } from './state-adapter';
import { ApprovalAdapter, IApprovalAdapter } from './approval-adapter';
import { CheckpointerAdapter, ICheckpointerAdapter } from './checkpointer-adapter';
import { PhaseRouter, IPhaseRouter } from './phase-router';
import { PiAgentExecutor, IPiAgentExecutor } from './pi-agent-executor';
import { WorkflowStateIO } from './pi-workflow-state-io';
import type { PiWorkflowState, PiInternalState } from './types/pi-workflow-state';

export interface WorkflowExecuteInput {
  ticketKey: string;
  threadId: string;
  currentPhase: string;
  input: any;
}

export interface WorkflowExecuteOutput {
  pipelineState: PiWorkflowState;
}

export class PiWorkflowEngine {
  private stateAdapter: IStateAdapter;
  private approvalAdapter: IApprovalAdapter;
  private checkpointerAdapter: ICheckpointerAdapter;
  private phaseRouter: IPhaseRouter;
  private agentExecutor: IPiAgentExecutor;
  private webviewPanel?: any;
  private pendingStates: PiWorkflowState[] = [];
  private stateIO: WorkflowStateIO;

  constructor(
    stateAdapter?: IStateAdapter,
    approvalAdapter?: IApprovalAdapter,
    checkpointerAdapter?: ICheckpointerAdapter,
    phaseRouter?: IPhaseRouter,
    agentExecutor?: IPiAgentExecutor,
    webviewPanel?: any,
  ) {
    this.stateAdapter = stateAdapter ?? new StateAdapter();
    this.approvalAdapter = approvalAdapter ?? new ApprovalAdapter();
    this.checkpointerAdapter = checkpointerAdapter ?? new CheckpointerAdapter();
    this.phaseRouter = phaseRouter ?? new PhaseRouter();
    this.agentExecutor = agentExecutor ?? new PiAgentExecutor();
    this.webviewPanel = webviewPanel;
    this.stateIO = new WorkflowStateIO(this.checkpointerAdapter, this.webviewPanel, this.pendingStates);
  }

  /**
   * Main orchestrator execute loop per UC-001
   * Workflow Execution Loop: Load → Adapt → Execute → Approval → PhaseRouter → Persist
   */
  async execute(input: WorkflowExecuteInput): Promise<WorkflowExecuteOutput> {
    const { ticketKey, threadId, currentPhase, input: userInput } = input;
    const baseState = this.buildBaseState(ticketKey, threadId, currentPhase);
    const piState = this.stateAdapter.toPiState(baseState as any);
    let updatedPiState;
    try {
      updatedPiState = await this.agentExecutor.execute(piState, userInput);
    } catch (e) {
      baseState.errors = [...(baseState.errors ?? []), `ERR_PI_SDK: ${e}`];
      (baseState as any).pipelineStatus = 'error';
      await this.persistPipelineState(baseState);
      this.stateIO.sendPiWorkflowState(baseState as any);
      throw e;
    }
    const approvalResult = await this.handleApprovalGate(updatedPiState, baseState, ticketKey, threadId);
    if (approvalResult.paused) {
      await this.stateIO.persistWorkflowState(approvalResult.state);
      this.stateIO.sendPiWorkflowState(approvalResult.state);
      return { pipelineState: approvalResult.state };
    }
    const workflowState = await this.adaptAndPersist(updatedPiState, ticketKey, threadId, currentPhase, approvalResult.approvalRequested, userInput);
    this.stateIO.sendPiWorkflowState(workflowState);
    return { pipelineState: workflowState };
  }

  async handleToolApproval(decision: 'approve' | 'reject', toolId: string): Promise<void> {
    this.approvalAdapter.handleApproval(decision, toolId);
    const adapterAny = this.approvalAdapter as any;
    const threadId = adapterAny.getThreadIdForTool?.(toolId) ?? toolId;
    if (!threadId || !/^([0-9a-fA-F-]{36}|thread-[a-zA-Z0-9-]+)$/.test(threadId)) {
      console.warn('[PiWorkflowEngine] handleToolApproval: invalid threadId, cannot resume', { toolId, threadId });
      return;
    }
    await this.resumeAfterApproval(threadId, decision);
  }

  async handleApprovalDecisionFromUI(extensionId: string, decision: 'approve' | 'reject'): Promise<void> {
    const adapterAny = this.approvalAdapter as any;
    const pending = adapterAny.getPendingApproval?.(extensionId);
    if (!pending?.threadId) {
      console.warn('[PiWorkflowEngine] Approval decision received without threadId, cannot resume');
      // Still resolve decision to avoid stuck state
      if (typeof adapterAny.resolveApprovalFromUI === 'function') {
        adapterAny.resolveApprovalFromUI(extensionId, decision);
      } else {
        this.approvalAdapter.handleApproval(decision, extensionId);
      }
      return;
    }
    const threadId = pending.threadId;
    if (typeof adapterAny.resolveApprovalFromUI === 'function') {
      adapterAny.resolveApprovalFromUI(extensionId, decision);
    } else {
      this.approvalAdapter.handleApproval(decision, extensionId);
    }
    await this.resumeAfterApproval(threadId, decision);
  }

  private async resumeAfterApproval(threadId: string, decision: 'approve' | 'reject') {
    try {
      const state = await this.checkpointerAdapter.load(threadId);
      if (state && state.pipelineStatus === 'paused') {
        state.pipelineStatus = decision === 'approve' ? 'running' : 'error';
        await this.stateIO.persistWorkflowState(state);
        await this.execute({
          ticketKey: state.ticketKey,
          threadId: state.threadId,
          currentPhase: state.currentPhase,
          input: '',
        });
      }
    } catch (e) {
      console.error('[PiWorkflowEngine] Resume after approval failed', e);
    }
  }



  private buildBaseState(ticketKey: string, threadId: string, currentPhase: string) {
    return {
      ticketKey,
      threadId,
      currentPhase: currentPhase as any,
      pipelineStatus: 'running',
      documents: {},
      agentOutputs: [],
      errors: [],
      chatHistory: [],
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      autonomyLevel: 'L2',
      piSessionId: '',
      currentAgentId: null,
      toolCallCount: 0,
    };
  }

  private async adaptAndPersist(updatedPiState: any, ticketKey: string, threadId: string, currentPhase: string, approvalRequested: boolean, userInput: any) {
    const intent = this.phaseRouter.classifyIntent(userInput || '');
    const routeResult = this.phaseRouter.routePhase({ ticketKey, threadId, currentPhase: currentPhase as any, pipelineStatus: 'running' } as any, intent);
    // Use full updatedState from router to avoid data loss
    const routedState = routeResult.updatedState;
    const mergedPiState = { ...updatedPiState, ...routedState };
    if (routeResult.nextPhase) mergedPiState.phase = routeResult.nextPhase;
    else if (routeResult.errors.length > 0) mergedPiState.status = 'paused';
    else mergedPiState.status = 'finished';
    if (routeResult.errors.length) mergedPiState.errors = [...(mergedPiState.errors ?? []), ...routeResult.errors];
    const workflowState = this.stateAdapter.fromPiState(mergedPiState);
    workflowState.ticketKey = ticketKey;
    workflowState.threadId = threadId;
    workflowState.currentPhase = updatedPiState.phase ?? updatedPiState.currentPhase ?? currentPhase;
    let status: 'running' | 'finished' | 'paused' | 'error' = updatedPiState.status === 'finished' ? 'finished' : 'running';
    if (approvalRequested) status = 'paused';
    workflowState.pipelineStatus = status as any;
    await this.stateIO.persistWorkflowState(workflowState);
    return workflowState;
  }

  private async handleApprovalGate(updatedPiState: any, pipelineState: any, ticketKey: string, threadId: string) {
    const toolCallsArr = Array.isArray(updatedPiState?.toolCalls) ? updatedPiState.toolCalls : [];
    const needsApproval = !!(updatedPiState?.metadata?.needsApproval || toolCallsArr.length > 0);
    let approvalRequested = false;
    if (needsApproval) {
      try {
        const crypto = await import('crypto');
        const fallbackId = crypto.randomUUID ? crypto.randomUUID() : `${ticketKey}-${threadId}-${Date.now()}`;
        const result = await this.approvalAdapter.requestApproval({
          tool_use_id: updatedPiState?.metadata?.toolUseId ?? fallbackId,
          sessionId: updatedPiState?.sessionId ?? '',
          ticketKey,
          threadId,
        });
        if (result?.isApproved === true) {
          approvalRequested = false;
          pipelineState.pipelineStatus = 'running';
        } else {
          approvalRequested = true;
          pipelineState.pipelineStatus = 'paused';
        }
      } catch (e) {
        console.error('[PiWorkflowEngine] Approval request failed', e);
        approvalRequested = true;
        pipelineState.pipelineStatus = 'paused';
      }
    }
    if (approvalRequested) {
      const workflowState = this.stateAdapter.fromPiState(updatedPiState);
      workflowState.ticketKey = ticketKey;
      workflowState.threadId = threadId;
      workflowState.currentPhase = updatedPiState.phase ?? updatedPiState.currentPhase ?? '';
      workflowState.pipelineStatus = 'paused';
      return { paused: true, state: workflowState, approvalRequested: true };
    }
    return { paused: false, state: null as any, approvalRequested };
  }

  private async persistPipelineState(state: any): Promise<void> {
    // Validate shape via adapter to avoid persisting malformed state
    const piInternal = this.stateAdapter.toPiState(state as any);
    const workflowState = this.stateAdapter.fromPiState(piInternal);
    // Merge original fields that adapter may not preserve
    workflowState.ticketKey = state.ticketKey ?? workflowState.ticketKey;
    workflowState.threadId = state.threadId ?? workflowState.threadId;
    workflowState.currentPhase = state.currentPhase ?? workflowState.currentPhase;
    workflowState.pipelineStatus = state.pipelineStatus ?? workflowState.pipelineStatus;
    await this.stateIO.persistWorkflowState(workflowState);
  }
}

// Singleton export for convenience
export const piWorkflowEngine = new PiWorkflowEngine();

