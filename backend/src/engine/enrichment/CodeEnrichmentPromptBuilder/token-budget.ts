/**
 * Token budgeting helpers for enrichment prompts.
 * Extracted from CodeEnrichmentPromptBuilder (BR-18) — pure functions, no behavior change.
 */

import type { LLMMessage } from '../../../modules/memory/llm/types.js';

/**
 * Approx characters per token (~4) — matches TokenBudgetManager.estimateTokens.
 * Word-count was unreliable for dense code/JSON (a single space-free field could be
 * tens of thousands of tokens yet count as one "word"), which caused prompts to blow
 * past the model context window (exceed_context_size_error).
 */
export const CHARS_PER_TOKEN = 4;

/** Maximum token estimate for body text sent to LLM. */
export const MAX_BODY_TOKENS = 4000;

/**
 * Hard cap on the TOTAL prompt (system + user) in tokens, as a last-resort guard
 * against accumulation (body + existing pseudo code + schema + signature). Sized well
 * under a typical model input window (e.g. 65536), leaving headroom for the model's
 * completion (`maxTokens`). Override via LLM_ENRICH_PROMPT_TOKEN_CAP.
 */
export const PROMPT_TOKEN_CAP = (() => {
  const parsed = parseInt(process.env.LLM_ENRICH_PROMPT_TOKEN_CAP || '', 10);
  return Number.isFinite(parsed) && parsed > 500 ? parsed : 24000;
})();

/** Estimate token count (~4 chars/token), consistent with TokenBudgetManager. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Truncate text to an estimated token budget. Char-based (not word-based): a single
 * space-free blob (e.g. minified JSON or inline Java) is a few "words" but many
 * tokens, so word-count let huge bodies through — the root cause of context overflow.
 * @param text Content to bound.
 * @param maxTokens Max estimated tokens to keep.
 * @returns The text if it fits, else a char-truncated prefix with an ellipsis marker.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const maxChars = Math.max(0, maxTokens * CHARS_PER_TOKEN);
  return text.slice(0, maxChars) + '...';
}

/**
 * Enforce PROMPT_TOKEN_CAP across system + user messages. The system prompt is
 * fixed instructions and kept intact; only the user message (which carries the
 * variable, untrusted content) is truncated to fit the remaining budget. Truncation
 * is char-based so dense/space-free content is also cut.
 */
export function capTotalPrompt(messages: LLMMessage[]): LLMMessage[] {
  const total = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (total <= PROMPT_TOKEN_CAP) return messages;

  const systemTokens = messages
    .filter((m) => m.role === 'system')
    .reduce((sum, m) => sum + estimateTokens(m.content), 0);
  // Reserve the system budget; give the rest to the (single) user message.
  const userBudget = Math.max(200, PROMPT_TOKEN_CAP - systemTokens);
  return messages.map((m) =>
    m.role === 'user'
      ? { ...m, content: truncateToTokens(m.content, userBudget) }
      : m,
  );
}
