/**
 * LLM Provider Abstraction — KSA-210
 * Defines a unified interface for LLM integrations (Anthropic, OpenAI, Ollama).
 * All providers must support both synchronous and streaming chat.
 * Tool calling is optional — providers that support it implement chatWithTools.
 */

import type { McpToolDefinition } from "./tool-registry";

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Tool call ID — required when role="tool" (tool result message) */
  toolCallId?: string;
  /** Tool name — for context when role="tool" */
  toolName?: string;
}

export interface LlmOptions {
  /** Sampling temperature (0.0–2.0). Lower = more deterministic. */
  temperature?: number;
  /** Maximum tokens in the response. */
  maxTokens?: number;
  /** Override the default model for this call. */
  model?: string;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

/** Represents a tool call requested by the LLM */
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Structured response from LLM with tool calling support */
export interface LlmResponse {
  type: "text" | "tool_use";
  /** Final text response when type="text" */
  text?: string;
  /** Tool calls when type="tool_use" */
  toolCalls?: LlmToolCall[];
}

export type LlmProviderType = "anthropic" | "openai" | "ollama" | "kiro" | "lmstudio" | "openrouter";

/**
 * Unified LLM provider interface.
 * Implementations lazily initialize SDK connections on first use.
 */
export interface LlmProvider {
  /** Provider type identifier */
  readonly type: LlmProviderType;

  /** Send messages and return the full response. */
  chat(messages: LlmMessage[], options?: LlmOptions): Promise<string>;

  /** Send messages and yield response tokens as they arrive. */
  chatStream(messages: LlmMessage[], options?: LlmOptions): AsyncGenerator<string>;

  /** Check if the provider is configured and reachable. */
  isAvailable(): Promise<boolean>;

  /** Dispose any held resources (connections, timers). */
  dispose(): void;

  /**
   * Get the context window size (in tokens) for the current model.
   * Used for dynamic context budgeting. Returns 0 if unknown.
   */
  getContextWindow(): number;

  /**
   * Chat with tool calling support. Returns structured response.
   * Optional — providers that don't support tools leave this undefined.
   */
  chatWithTools?(
    messages: LlmMessage[],
    tools: McpToolDefinition[],
    options?: LlmOptions
  ): Promise<LlmResponse>;
}
