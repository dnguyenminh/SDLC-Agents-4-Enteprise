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

/** Structured summary of compacted content, used to preserve critical information. */
export interface CompactSummary {
  /** What this content was about */
  topic: string;
  /** Key constraints/rules preserved from the original content */
  constraints: string[];
  /** Important code/API references (kept verbatim if possible) */
  references: Array<{type: 'code'|'api'|'rule'; content: string; language?: string}>;
  /** Current state summary captured from the original content */
  state: string;
  /** Critical reminders - especially negations and must-do items */
  criticalReminders: string[];
}

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

  /** Build structured summarization prompt that enforces exact format.
   * The LLM must output in this exact structure (no deviations):
   * [TOPIC]
   * [CONSTRAINTS: comma-separated list or "NONE"]
   * [REFERENCES: code snippets kept verbatim, or "NONE"]
   * [STATE: current state summary]
   * [CRITICAL REMINDERS: bullet points, or "NONE"]
   */
  buildStructuredSummarizationPrompt(serializedHistory: string, targetTokens: number): string {
    return [
      'YOU ARE A CONTEXT COMPRESSOR. Your job is to summarize content while PRESERVING',
      'ALL critical information that could cause hallucination if lost.',
      '',
      'INPUT: ' + targetTokens + ' tokens',
      'TARGET: ' + targetTokens + ' tokens (preserve critical info)',
      '',
      'STRICT REQUIREMENTS:',
      '1. Output MUST use this EXACT structure (no deviations):',
      '   [TOPIC]',
      '   [CONSTRAINTS: comma-separated list or "NONE"]',
      '   [REFERENCES: code snippets kept verbatim, or "NONE"]',
      '   [STATE: current state summary]',
      '   [CRITICAL REMINDERS: bullet points, or "NONE"]',
      '',
      '2. NEVER remove these element types even if "unimportant":',
      '   - System constraints (must, required, should, never)',
      '   - Numerical thresholds (ratios, limits, percentages)',
      '   - Unique identifiers (claim numbers, rule IDs, file paths)',
      '   - Negation phrases (do NOT, must NOT, avoid)',
      '',
      '3. If content does not fit target tokens, prioritize in this order:',
      '   a) Critical reminders (must-preserve)',
      '   b) Constraints and rules',
      '   c) Code references (keep snippets, summarize surrounding text)',
      '   d) Narrative descriptions (aggressive summarization)',
      '',
      '4. Output ONLY the summary - no meta-commentary, no "here\'s the summary:"',
      '',
      'ORIGINAL CONTEXT:',
      serializedHistory,
      '',
    ].join('\n');
  }

  /** Parse LLM output into CompactSummary structure.
   * The LLM output must follow the exact structure:
   * [TOPIC]
   * [CONSTRAINTS: ...]
   * [REFERENCES: ...]
   * [STATE: ...]
   * [CRITICAL REMINDERS: ...]
   */
  parseCompactSummary(output: string): CompactSummary {
    const result: CompactSummary = {
      topic: '',
      constraints: [],
      references: [],
      state: '',
      criticalReminders: [],
    };

    const sections = output.split(/\n\n/).map(s => s.trim()).filter(s => s.length > 0);

    for (const section of sections) {
      if (section.startsWith('[TOPIC]')) {
        result.topic = section.replace('[TOPIC]', '').trim();
      } else if (section.startsWith('[CONSTRAINTS]')) {
        const constraintsText = section.replace('[CONSTRAINTS]', '').trim();
        result.constraints = constraintsText === 'NONE'
          ? []
          : constraintsText.split(',').map(c => c.trim()).filter(c => c.length > 0);
      } else if (section.startsWith('[REFERENCES]')) {
        const refsText = section.replace('[REFERENCES]', '').trim();
        if (refsText !== 'NONE' && refsText.startsWith('```')) {
          // Code reference kept verbatim - extract the language and code
          const languageMatch = refsText.match(/```(\w+)/);
          const codeMatch = refsText.match(/```[\s\S]*?```/);
          if (codeMatch) {
            result.references.push({
              type: 'code',
              language: languageMatch ? languageMatch[1] : undefined,
              content: codeMatch[0].replace(/```[\w]*\n/, '').replace(/```$/, '').trim(),
            });
          }
        } else if (refsText !== 'NONE') {
          // Non-code reference
          result.references.push({ type: 'api', content: refsText });
        }
      } else if (section.startsWith('[STATE]')) {
        result.state = section.replace('[STATE]', '').trim();
      } else if (section.startsWith('[CRITICAL REMINDERS]')) {
        const remindersText = section.replace('[CRITICAL REMINDERS]', '').trim();
        result.criticalReminders = remindersText === 'NONE'
          ? []
          : remindersText.split('\n').map(r => r.trim()).filter(r => r.length > 0);
      }
    }

    return result;
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

  /** Generate a structured summary from chat history using LLM.
   * @param chatHistory - The chat messages to summarize
   * @param targetTokens - Target token count for the summary
   * @returns CompactSummary with topic, constraints, references, state, criticalReminders
   */
  async generateSummary(chatHistory: ChatMessage[], targetTokens: number): Promise<CompactSummary> {
    const serialized = this.serializeChatHistory(chatHistory);
    const prompt = this.buildStructuredSummarizationPrompt(serialized, targetTokens);
    const raw = await this.llmProvider.call(prompt, { timeout: LLM_TIMEOUT_MS });
    return this.parseCompactSummary(raw);
  }
}
