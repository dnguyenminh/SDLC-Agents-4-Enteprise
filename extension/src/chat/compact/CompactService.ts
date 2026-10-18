/**
 * SA4E-182 — CompactService (Orchestrator).
 * Executes compact: summarize OR fallback truncate, then atomic state replacement.
 * Business Rules: BR-01..BR-09, BR-12, BR-14. Security: SEC-01, SEC-02, SEC-03.
 * Contracts and pure ops live in ./CompactService/*.
 */

import type { CompactResult, CompactMethod, CompactMonitorState, CompactTrigger, ChatMessage } from './types';
import { CompactAlreadyRunningError, InsufficientMessagesError } from './errors';
import { filterSecrets } from './secretFilter';
import {
  LLM_TIMEOUT_MS,
  MIN_MESSAGES,
  type ContextManagerReader,
  type KnowledgeClient,
  type LlmProvider,
  type StateGraph,
  type StreamHandler,
} from './CompactService/contracts';
import {
  buildCompactResult,
  buildSummarizationPromptText,
  createSummaryChatMessage,
  executeFallbackTruncation,
  serializeChatMessages,
  validateSummarySize,
} from './CompactService/ops';
import { persistCompactEventAsync } from './CompactService/kb-persist';
import { emitCompactStart, emitCompactComplete, emitCompactError } from './CompactService/events';
import { replaceChatState } from './CompactService/state-replace';

export type {
  ContextManagerReader,
  KnowledgeClient,
  LlmProvider,
  StateGraph,
  StreamHandler,
} from './CompactService/contracts';

/**
 * Orchestrates compact: validate → emit → summarize → replace → persist.
 * Falls back to truncation if LLM fails.
 */
export class CompactService {
  constructor(
    private readonly llmProvider: LlmProvider,
    private readonly contextManager: ContextManagerReader,
    private readonly streamHandler: StreamHandler,
    private readonly graph: StateGraph,
    private readonly knowledgeClient: KnowledgeClient | null,
    private readonly monitorState: CompactMonitorState
  ) {}

  /**
   * Execute compact operation end-to-end.
   * @param trigger - 'manual' | 'auto'
   * @param threadId - Current thread identifier (preserved)
   * @param chatHistory - Current message array (read-only)
   * @returns CompactResult with before/after metrics
   * @throws CompactAlreadyRunningError if concurrent
   * @throws InsufficientMessagesError if < 3 messages
   */
  async executeCompact(
    trigger: CompactTrigger,
    threadId: string,
    chatHistory: ChatMessage[]
  ): Promise<CompactResult> {
    this.validatePreconditions(chatHistory);
    this.monitorState.isCompacting = true;

    const before = this.contextManager.getState();
    try {
      this.emitStart(trigger, before.usagePercent);
      const { method, newHistory, summaryText } =
        await this.compactMessages(chatHistory, before.tokenCount);
      await this.replaceState(threadId, newHistory);

      const after = this.contextManager.getState();
      this.persistAsync(threadId, trigger, method, before, chatHistory, summaryText);
      this.emitComplete(method, before.usagePercent, after.usagePercent, summaryText);

      return this.buildResult(method, summaryText, before, after, chatHistory, newHistory);
    } catch (err) {
      this.emitError(err, false);
      throw err;
    } finally {
      this.monitorState.isCompacting = false;
    }
  }

  /** Validate mutex and minimum message count */
  private validatePreconditions(chatHistory: ChatMessage[]): void {
    if (this.monitorState.isCompacting) {
      throw new CompactAlreadyRunningError();
    }
    if (chatHistory.length < MIN_MESSAGES) {
      throw new InsufficientMessagesError();
    }
  }

  /** Attempt summarization, fallback to truncation on failure */
  private async compactMessages(
    chatHistory: ChatMessage[],
    beforeTokens: number
  ): Promise<{ method: CompactMethod; newHistory: ChatMessage[]; summaryText: string }> {
    try {
      const serialized = this.serializeChatHistory(chatHistory);
      const filtered = filterSecrets(serialized);
      const prompt = this.buildSummarizationPrompt(filtered);
      const rawSummary = await this.llmProvider.call(prompt, { timeout: LLM_TIMEOUT_MS });
      const summary = filterSecrets(rawSummary);
      this.validateSummary(summary, beforeTokens);
      return {
        method: 'summary',
        newHistory: [this.createSummaryMessage(summary, beforeTokens)],
        summaryText: summary,
      };
    } catch {
      const result = this.executeFallbackTruncation(chatHistory);
      return { method: 'truncation', newHistory: result.messages, summaryText: result.notice };
    }
  }
  /** Build LLM prompt with delimiter fence (SEC-01) — see CompactService/ops. */
  buildSummarizationPrompt(serializedHistory: string): string {
    return buildSummarizationPromptText(serializedHistory);
  }

  /** Validate summary size is <= 15% of original token count (BR-09) */
  validateSummary(summary: string, originalTokens: number): void {
    validateSummarySize(summary, originalTokens);
  }

  /** Create summary message as role:'assistant' with boundary prefix (SEC-03) */
  createSummaryMessage(summary: string, beforeTokens: number): ChatMessage {
    return createSummaryChatMessage(summary, beforeTokens);
  }

  /** Remove oldest 50% of messages; insert truncation notice (BR-07) */
  executeFallbackTruncation(
    history: ChatMessage[]
  ): { messages: ChatMessage[]; notice: string } {
    return executeFallbackTruncation(history);
  }

  /** Serialize chat messages with role tags for LLM consumption */
  serializeChatHistory(messages: ChatMessage[]): string {
    return serializeChatMessages(messages);
  }

  /** Atomic state replacement via graph.updateState (AD-03) — see CompactService/state-replace. */
  private async replaceState(threadId: string, newHistory: ChatMessage[]): Promise<void> {
    await replaceChatState(this.graph, threadId, newHistory);
  }

  /** Persist compact event to KB (non-blocking, best-effort) — see CompactService/kb-persist. */
  private persistAsync(
    threadId: string,
    trigger: CompactTrigger,
    method: CompactMethod,
    before: { tokenCount: number },
    chatHistory: ChatMessage[],
    summary: string
  ): void {
    persistCompactEventAsync(
      { knowledgeClient: this.knowledgeClient, contextManager: this.contextManager },
      threadId, trigger, method, before, chatHistory, summary,
    );
  }

  private emitStart(trigger: CompactTrigger, usagePercent: number): void {
    emitCompactStart(this.streamHandler, trigger, usagePercent);
  }

  private emitComplete(
    method: CompactMethod, beforePercent: number, afterPercent: number, summary: string
  ): void {
    emitCompactComplete(this.streamHandler, method, beforePercent, afterPercent, summary);
  }

  private emitError(err: unknown, fallbackApplied: boolean): void {
    emitCompactError(this.streamHandler, err, fallbackApplied);
  }

  /** Build the caller-facing result (before/after metrics) — see CompactService/ops. */
  private buildResult(
    method: CompactMethod, summary: string,
    before: { tokenCount: number; usagePercent: number },
    after: { tokenCount: number; usagePercent: number },
    oldHistory: ChatMessage[], newHistory: ChatMessage[]
  ): CompactResult {
    return buildCompactResult(method, summary, before, after, oldHistory, newHistory);
  }
}
