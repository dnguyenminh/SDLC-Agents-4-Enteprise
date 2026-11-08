/**
 * SA4E-421 — Context eviction (16K Doc §8).
 *
 * Score:  S_evict = (Age_in_Turns × 200) + Token_Count − (Referenced_In_Last_Thought × 1000)
 * Rules:
 *  - Batch evict when history exceeds ~75% of the token budget.
 *  - Evict in-place → tombstone that PRESERVES tool_call_id.
 *  - Exempt: evidence IDs referenced by the scratchpad; code currently in use.
 *
 * The budget number comes from the caller — SA4E-422's runtime token budget
 * calculator computes `options.tokenBudget`; this engine stays deterministic
 * using Σ estimateTokens(message content) for its own accounting.
 */

import { estimateTokens } from '../agent-tools/tool-context.js';

export const EVICTION_AGE_WEIGHT = 200;
export const EVICTION_REFERENCE_CREDIT = 1000;
export const EVICTION_THRESHOLD = 0.75;
/** Batch eviction drains down to this fraction (headroom below threshold). */
export const EVICTION_TARGET = 0.7;
/** Cost of a tombstone placeholder (tool_call_id kept). */
export function tombstoneTokens(toolCallId: string): number {
  return estimateTokens(`[evicted tool_call_id=${toolCallId}]`);
}

export interface HistoryMessage {
  toolCallId: string;
  role: 'tool' | 'assistant' | 'user';
  content: string;
  /** turns since the message was appended (0 = current turn). */
  ageTurns: number;
  /** referenced in the model's last thought → protective −1000 credit. */
  referencedInLastThought?: boolean;
  /** code artifact currently in use (e.g. last read_code_block) — never evict. */
  inUse?: boolean;
  evicted?: boolean;
}

export interface EvictionOptions {
  /** Runtime budget for history+scratchpad (SA4E-422 supplies the value). */
  tokenBudget: number;
  threshold?: number;
  target?: number;
  /** evidence IDs referenced by the scratchpad — exempt from eviction. */
  exemptEvidenceIds?: Set<string>;
}

export interface EvictionResult {
  messages: HistoryMessage[];
  evictedToolCallIds: string[];
  exemptedToolCallIds: string[];
  tokensBefore: number;
  tokensAfter: number;
  batchTriggered: boolean;
}

/** S_evict — higher means evict sooner. Exempt messages return -Infinity. */
export function evictionScore(msg: HistoryMessage, exempt: boolean): number {
  if (exempt || msg.inUse) return Number.NEGATIVE_INFINITY;
  const referenced = msg.referencedInLastThought ? EVICTION_REFERENCE_CREDIT : 0;
  return msg.ageTurns * EVICTION_AGE_WEIGHT + estimateTokens(msg.content) - referenced;
}

function isExempt(msg: HistoryMessage, opts: EvictionOptions): boolean {
  if (msg.inUse) return true;
  if (msg.evicted) return true;
  const exemptIds = opts.exemptEvidenceIds;
  if (exemptIds && (exemptIds.has(msg.toolCallId) || exemptIds.has(`tool_call_id:${msg.toolCallId}`))) return true;
  return false;
}

function totalTokens(messages: HistoryMessage[]): number {
  return messages.reduce(
    (sum, m) => sum + (m.evicted ? tombstoneTokens(m.toolCallId) : estimateTokens(m.content)),
    0,
  );
}

/** In-place tombstone: content dropped, tool_call_id preserved (§8 rule). */
function tombstone(msg: HistoryMessage): HistoryMessage {
  return { ...msg, content: `[evicted tool_call_id=${msg.toolCallId}]`, evicted: true };
}

/**
 * Batch eviction: when tokens > budget × threshold, evict highest-score
 * messages in ONE batch until tokens ≤ budget × target (or nothing left).
 */
export function batchEvict(messages: HistoryMessage[], opts: EvictionOptions): EvictionResult {
  const threshold = opts.threshold ?? EVICTION_THRESHOLD;
  const target = opts.target ?? EVICTION_TARGET;
  const tokensBefore = totalTokens(messages);
  const exempted = messages.filter((m) => isExempt(m, opts)).map((m) => m.toolCallId);

  if (tokensBefore <= opts.tokenBudget * threshold) {
    return {
      messages,
      evictedToolCallIds: [],
      exemptedToolCallIds: exempted,
      tokensBefore,
      tokensAfter: tokensBefore,
      batchTriggered: false,
    };
  }

  const ranked = messages
    .filter((m) => !isExempt(m, opts))
    .map((m) => ({ msg: m, score: evictionScore(m, false) }))
    .sort((a, b) => b.score - a.score);

  const out = [...messages];
  const evictedToolCallIds: string[] = [];
  let current = tokensBefore;
  const targetTokens = opts.tokenBudget * target;
  for (const { msg } of ranked) {
    if (current <= targetTokens) break;
    const idx = out.findIndex((m) => m.toolCallId === msg.toolCallId && !m.evicted);
    if (idx === -1) continue;
    const before = estimateTokens(out[idx].content);
    out[idx] = tombstone(out[idx]);
    current -= before - tombstoneTokens(msg.toolCallId);
    evictedToolCallIds.push(msg.toolCallId);
  }
  const tokensAfter = totalTokens(out);
  return {
    messages: out,
    evictedToolCallIds,
    exemptedToolCallIds: exempted,
    tokensBefore,
    tokensAfter,
    batchTriggered: true,
  };
}
