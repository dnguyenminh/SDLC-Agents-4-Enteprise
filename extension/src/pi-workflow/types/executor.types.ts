export interface ExecuteTurnInput {
  ticketKey: string;
  sessionId: string;
  agentId: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }>;
  /** Workspace-aware systemPrompt (SA4E-333) — forwarded to PiRunInput. */
  systemPrompt?: string;
  /** Per-turn circuit breaker (SA4E-33x loop guard) — forwarded to PiRunInput. */
  turnBudget?: import('../turn-budget-guard.js').TurnBudget;
  /** Live tool-activity callback (progress display) — forwarded to PiRunInput. */
  onToolEvent?: import('../pi-provider-types.js').PiRunInput['onToolEvent'];
  /** FIX A: pi-ai provider id (e.g. 'anthropic') resolved by the engine. */
  provider?: string;
  /** FIX A: pi-ai model id (e.g. 'claude-opus-4-7') resolved by the engine. */
  model?: string;
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'error' | 'done';
  content?: string;
  toolCall?: NormalizedToolCall;
  error?: string;
}

export interface PiAgentExecutionResult {
  ticketKey: string;
  sessionId: string;
  agentId: string;
  messages: Array<{ role: string; content: string }>;
  toolCalls: NormalizedToolCall[];
  streamChunks: StreamChunk[];
  error?: { code: string; message: string };
  piSessionId?: string;
  toolCallCount?: number;
}
