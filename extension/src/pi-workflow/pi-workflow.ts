import { PiProvider, type IPiProvider } from './pi-provider.js';
import { PiAgentExecutor } from './pi-agent-executor.js';
import { PhaseRouter, type Intent } from './phase-router.js';
import { StateAdapter } from './state-adapter.js';
import { CheckpointerAdapter, type RemoteCheckpointerStore } from './checkpointer-adapter.js';
import { ApprovalAdapter, type ToolApprovalGateHandler } from './approval-adapter.js';
import type { PipelineState, PiInternalState } from './types/pi-workflow-state.js';
import type { PiAgentExecutionResult, NormalizedToolCall } from './types/executor.types.js';

export interface PiWorkflowConfig {
  provider?: IPiProvider;
  remoteStore?: RemoteCheckpointerStore;
  gateHandler?: ToolApprovalGateHandler;
}

export class PiWorkflowEngine {
  private provider: IPiProvider;
  private executor: PiAgentExecutor;
  private router: PhaseRouter;
  private stateAdapter: StateAdapter;
  private checkpointer: CheckpointerAdapter;
  private approvalAdapter: ApprovalAdapter;

  constructor(config: PiWorkflowConfig = {}) {
    this.provider = config.provider || new PiProvider();
    this.executor = new PiAgentExecutor(this.provider);
    this.router = new PhaseRouter();
    this.stateAdapter = new StateAdapter();
    this.checkpointer = new CheckpointerAdapter(config.remoteStore);
    this.approvalAdapter = new ApprovalAdapter(config.gateHandler);
  }

  async initialize(transportType: 'WebSocket' | 'HTTP' = 'HTTP'): Promise<void> {
    await this.provider.initialize({ transportType });
  }

  async executeTurn(
    currentState: PipelineState,
    inputMessage: string,
    agentId: string
  ): Promise<{ result: PiAgentExecutionResult; nextState: PiInternalState }> {
    const piState = this.stateAdapter.toPiState(currentState);
    // 2. Immutability fix: create new array instead of mutating currentState.chatHistory directly
    const messages = [...(piState.chatHistory || []), { role: 'user', content: inputMessage }];

    const executionResult = await this.executor.executeTurn({
      ticketKey: piState.ticketKey,
      sessionId: piState.piSessionId,
      agentId,
      messages
    });

    const approvedToolCalls: NormalizedToolCall[] = [];
    if (executionResult.toolCalls && executionResult.toolCalls.length > 0) {
      for (const toolCall of executionResult.toolCalls) {
        // 1. Tool approval check fix: enforce checking approved flag
        const approval = await this.approvalAdapter.processToolApproval(toolCall, {
          agentId,
          ticketKey: piState.ticketKey
        });

        if (approval.approved) {
          approvedToolCalls.push(approval.normalizedToolCall);
        } else {
          executionResult.error = executionResult.error || {
            code: 'TOOL_APPROVAL_REJECTED',
            message: `Tool call '${toolCall.name}' was rejected: ${approval.reason || 'User rejected'}`
          };
        }
      }
    }
    executionResult.toolCalls = approvedToolCalls;

    // 3. Error tracking fix: record turn errors in state.errors and mark pipelineStatus = 'ERROR'
    const errors = [...(piState.errors || [])];
    let pipelineStatus = piState.pipelineStatus;

    if (executionResult.error) {
      errors.push(executionResult.error);
      pipelineStatus = 'ERROR';
    }

    const updatedState: PiInternalState = {
      ...piState,
      chatHistory: executionResult.messages,
      currentAgentId: agentId,
      toolCallCount: piState.toolCallCount + approvedToolCalls.length,
      errors,
      pipelineStatus
    };

    if (piState.threadId) {
      await this.checkpointer.savePiState(piState.threadId, updatedState);
    }

    return { result: executionResult, nextState: updatedState };
  }

  async transitionPhase(
    currentState: PipelineState,
    intent: Intent
  ): Promise<{ nextPhase: string; nextState: PiInternalState }> {
    const piState = this.stateAdapter.toPiState(currentState);
    const routingResult = await this.router.routePhase(piState, intent);
    const nextState = this.stateAdapter.toPiState(routingResult.updatedState as PipelineState);

    if (nextState.threadId) {
      await this.checkpointer.savePiState(nextState.threadId, nextState);
    }

    return { nextPhase: routingResult.nextPhase, nextState };
  }

  /**
   * Public accessor to load persisted state from checkpointer.
   */
  async loadPersistedState(threadId: string): Promise<PiInternalState | null> {
    return this.checkpointer.loadPiState(threadId);
  }
}
