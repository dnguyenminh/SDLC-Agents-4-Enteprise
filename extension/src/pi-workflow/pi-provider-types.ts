import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

export interface PiInput {
  prompt: string;
  context?: Record<string, unknown>;
}

export interface PiRunInput extends PiInput {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  tools?: AgentTool[];
  sessionId?: string;
}

export interface PiRunResult {
  text: string;
  toolCalls: ToolCall[];
  chunks: PiStreamChunk[];
  messages: AgentMessage[];
  errorMessage?: string;
}

export interface PiStreamChunk {
  type: 'text' | 'tool_call' | 'error' | 'done';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface PiAgent {
  agentId: string;
  tools?: unknown[];
  sdkInstance?: unknown;
}

export type CredentialResolver = (provider: string) => Promise<string | undefined> | string | undefined;

export interface IPiProvider {
  readonly providerName: 'PiProvider';
  initialize(config: import('./pi-provider-config.js').PiProviderConfig): Promise<void>;
  createAgent(agentId: string, tools?: unknown[]): Promise<PiAgent>;
  run(input: PiRunInput): Promise<PiRunResult>;
  stream(input: PiInput): AsyncIterable<PiStreamChunk>;
  handleToolUse(toolCall: ToolCall): Promise<ToolResult>;
  setCredentialResolver(resolver: CredentialResolver): void;
  seedCredentials(providerId: string, key: string): Promise<void>;
  registerGateway(providerId: string, baseUrl: string, apiKey?: string): Promise<void>;
  setModel(providerId: string, modelId: string): Promise<boolean>;
  resolveDefaultModel(providerId: string): string | undefined;
  setFallbackModels(providerId: string, modelIds: string[]): void;
  abort(): void;
  dispose(): void;
}
