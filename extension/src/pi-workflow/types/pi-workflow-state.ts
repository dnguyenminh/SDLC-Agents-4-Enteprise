export interface PipelineState {
  ticketKey: string;
  threadId: string;
  currentPhase: string;
  pipelineStatus?: string;
  chatHistory?: Array<{ role: string; content: string }>;
  agentOutputs?: Record<string, unknown>;
  errors?: Array<{ code: string; message: string }>;
  [key: string]: unknown;
}

export interface PiInternalState extends PipelineState {
  piSessionId: string;
  currentAgentId: string | null;
  toolCallCount: number;
}

export interface PiWorkflowState {
  piSessionId: string;
  currentAgentId: string;
  toolCallCount: number;
}
