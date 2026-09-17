export class StateMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateMappingError';
  }
}

export interface PiWorkflowState {
  ticketKey: string;
  threadId: string;
  currentPhase: string;
  pipelineStatus: 'running' | 'paused' | 'finished' | 'error';
  piSessionId: string;
  currentAgentId: string | null;
  toolCallCount: number;
  approvalDecision?: 'approve' | 'reject';
  errors?: string[];
  chatHistory?: any[];
  agentOutputs?: any[] | {};
  pipelineDefinition?: any;
  autonomyLevel?: string;
}

export interface PiInternalState extends PiWorkflowState {
  sessionId?: string;
  agentId?: string;
  phase?: string;
  ticket?: string;
  toolCalls?: number;
  status?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}
