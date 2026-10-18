/**
 * CompactService contracts + tuning constants (SA4E-182).
 * LLM provider / stream / state / KB abstractions (DIP — injected, not imported).
 */

import type { CompactStreamEvent } from '../types';

/** LLM provider abstraction (DIP — injected, not imported) */
export interface LlmProvider {
  call(prompt: string, options?: { timeout?: number }): Promise<string>;
}

/** Stream handler for emitting events to webview */
export interface StreamHandler {
  emitDirect(event: CompactStreamEvent): void;
}

/** State graph interface for atomic state replacement */
export interface StateGraph {
  updateState(
    config: { configurable: { thread_id: string } },
    state: Record<string, unknown>
  ): Promise<void>;
}

/** Context manager for reading token metrics */
export interface ContextManagerReader {
  getState(): { tokenCount: number; usagePercent: number };
}

/** Knowledge client for persisting compact events */
export interface KnowledgeClient {
  createMessage(
    threadId: string,
    msg: { role: string; content: string; agent_id: string }
  ): Promise<void>;
}

/** Minimum messages required for compact */
export const MIN_MESSAGES = 3;
/** LLM summarization timeout in ms */
export const LLM_TIMEOUT_MS = 10_000;
/** Max summary size as fraction of original token count */
export const MAX_SUMMARY_RATIO = 0.15;
