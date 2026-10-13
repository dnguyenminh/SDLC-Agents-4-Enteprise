/**
 * Transcript compaction mechanics — SA4E-355 UAT bugs 2 & 3.
 *
 * Compacts a pi-ai transcript (`Message[]`) to a token budget WITHOUT
 * breaking the wire contract:
 * - trim-oldest-first at TOOL-UNIT granularity: an assistant toolCall message
 *   and the toolResult messages that follow it are atomic — separating them
 *   makes the provider 400 on the orphaned pairing;
 * - system messages (prompt + tool declarations) are PINNED — always kept;
 * - the NEWEST user message is PINNED (bug 3): letting the trim point cross
 *   it produced a transcript with NO user query, which llama-server's qwen
 *   chat template rejects with `Jinja Exception: No user query found` (500).
 *   Its budget is RESERVED before the tool-unit walk — raw when it fits,
 *   compressed when only that fits, kept compressed even when over budget
 *   (the caller's budget gate then REJECTS — BR-09 — instead of a 500);
 * - a unit that does not fit raw is kept with its text/thinking COMPRESSED;
 *   toolCall blocks stay intact for id pairing.
 *
 * Never mutates the input; returns a new array.
 */
import type { Message } from '@earendil-works/pi-ai';
import { compressPrompt, estimateTokenCount } from '../pi-agent/prompt-compressor.js';
import { logger } from '../logger';

/** Wire-visible text of one message content (string | content blocks). */
export function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      const b = block as { type?: string; text?: string; thinking?: string; name?: string; arguments?: unknown };
      if (b?.type === 'text') return b.text ?? '';
      if (b?.type === 'thinking') return b.thinking ?? '';
      if (b?.type === 'toolCall') return `${b.name ?? ''} ${JSON.stringify(b.arguments ?? {})}`;
      return JSON.stringify(block);
    })
    .join('\n');
}

/** True when the message carries toolCall blocks (pairing anchor). */
function hasToolCall(msg: Message): boolean {
  const content = (msg as { content?: unknown }).content;
  return Array.isArray(content) && content.some((b) => (b as { type?: string })?.type === 'toolCall');
}

/** System messages are the fixed part (prompt + tool declarations) — pinned. */
function isPinnedSystem(msg: Message): boolean {
  return (msg as { role?: string }).role === 'system';
}

/** Groups the transcript into atomic units — the ONLY safe trim boundary (see module doc). */
function groupToolUnits(messages: ReadonlyArray<Message>): Message[][] {
  const units: Message[][] = [];
  for (const msg of messages) {
    const m = msg as { role?: string };
    if (m.role === 'assistant' && hasToolCall(msg)) {
      units.push([msg]);
      continue;
    }
    const last = units[units.length - 1];
    if (m.role === 'toolResult' && last && hasToolCall(last[0])) {
      last.push(msg); // belongs to the preceding assistant toolCall unit
      continue;
    }
    units.push([msg]);
  }
  return units;
}

/** Copy of the message with text/thinking blocks compressed (UC-03). ToolCall blocks stay intact. */
function compressMessageText(msg: Message): Message {
  const m = msg as { role?: string; content?: unknown };
  if (isPinnedSystem(msg) || typeof m.content === 'string') {
    if (typeof m.content !== 'string') return msg;
    return { ...msg, content: compressPrompt(m.content) } as Message;
  }
  if (!Array.isArray(m.content)) return msg;
  const compressed = m.content.map((block) => {
    const b = block as { type?: string; text?: string; thinking?: string };
    if (b?.type === 'text' && typeof b.text === 'string') return { ...b, text: compressPrompt(b.text) };
    if (b?.type === 'thinking' && typeof b.thinking === 'string') return { ...b, thinking: compressPrompt(b.thinking) };
    return block;
  });
  return { ...msg, content: compressed } as Message;
}

/** Estimated tokens of one unit (chars/4 over the flattened wire text). */
function unitTokens(unit: ReadonlyArray<Message>): number {
  return unit.reduce((sum, m) => sum + estimateTokenCount(flattenContent((m as { content?: unknown }).content)), 0);
}

/** Kept form of one unit: `{ messages, tokens, compressed }`. */
interface KeptUnit {
  messages: Message[]; tokens: number; compressed: boolean;
}

/** Kept form of one unit — raw, compressed, or null when neither fits `budgetLeft`. */
function fitUnit(unit: Message[], budgetLeft: number): KeptUnit | null {
  const rawTokens = unitTokens(unit);
  if (rawTokens <= budgetLeft) return { messages: unit, tokens: rawTokens, compressed: false };
  const compressed = unit.map(compressMessageText);
  const compressedTokens = unitTokens(compressed);
  if (compressedTokens <= budgetLeft) return { messages: compressed, tokens: compressedTokens, compressed: true };
  return null;
}

/** Index of the newest standalone user-message unit, or -1 when none exists. */
function newestUserUnitIndex(units: Message[][]): number {
  for (let i = units.length - 1; i >= 0; i--) {
    if ((units[i][0] as { role?: string }).role === 'user') return i;
  }
  return -1;
}

/** Budget reserved up-front for the pinned newest user unit: raw size when it fits the whole budget, else compressed size when that fits, else 0 (BR-09 reject path). */
function userReserveTokens(unit: Message[] | undefined, budgetTokens: number): number {
  if (!unit) return 0;
  const rawTokens = unitTokens(unit);
  if (rawTokens <= budgetTokens) return rawTokens;
  const compressedTokens = unitTokens(unit.map(compressMessageText));
  return compressedTokens <= budgetTokens ? compressedTokens : 0;
}

/** Kept form of the PINNED newest user unit — never null: reuses `fitUnit` and falls back to the compressed unit even when over budget (the caller's BR-09 gate REJECTS, no provider 500). */
function fitPinnedUser(unit: Message[], budgetLeft: number): KeptUnit {
  const fit = fitUnit(unit, budgetLeft);
  if (fit) return fit;
  const compressed = unit.map(compressMessageText);
  return { messages: compressed, tokens: unitTokens(compressed), compressed: true };
}

/** Mutable walk state threaded through the unit keepers. */
interface WalkState {
  total: number; changed: boolean; overflowed: boolean;
}

/** Keeps the pinned newest user unit — raw when it fits, compressed otherwise; never dropped. */
function keepPinnedUser(unit: Message[], budgetTokens: number, state: WalkState, kept: Message[][]): void {
  const fit = fitPinnedUser(unit, budgetTokens - state.total);
  kept.unshift(fit.messages);
  state.total += fit.tokens;
  state.changed = state.changed || fit.compressed;
}

/** Keeps one trimmable unit, or sets the trim point when it cannot fit. */
function keepTrimmable(unit: Message[], budgetLeft: number, state: WalkState, kept: Message[][]): void {
  const fit = fitUnit(unit, budgetLeft);
  if (fit) {
    kept.unshift(fit.messages);
    state.total += fit.tokens;
    state.changed = state.changed || fit.compressed;
    return;
  }
  state.overflowed = true; // this unit (and everything older but unpinned) cannot fit
  state.changed = true;
}

/** Walks units newest→oldest: pinned systems and the pinned newest user survive past the trim point; other units fit the reserve-aware budget or trim everything older. */
function walkUnitsNewestFirst(units: Message[][], userIdx: number, reserve: number, budgetTokens: number): { kept: Message[][]; changed: boolean } {
  const kept: Message[][] = [];
  const state: WalkState = { total: 0, changed: false, overflowed: false };
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    if (isPinnedSystem(unit[0])) {
      kept.unshift(unit); // pinned fixed part — survives even past the trim point
    } else if (i === userIdx) {
      keepPinnedUser(unit, budgetTokens, state, kept); // pinned newest user query
    } else if (state.overflowed) {
      state.changed = true; // older non-pinned units are dropped (trim-oldest-first)
    } else {
      keepTrimmable(unit, budgetTokens - reserve - state.total, state, kept);
    }
  }
  return { kept, changed: state.changed };
}

/** Defensive post-check (bug 3): compaction must keep a user query or the provider's chat template 500s — warn (never crash) on exotic userless transcripts. */
function warnIfNoUserQuery(result: { messages: Message[]; compacted: boolean }): void {
  if (!result.compacted) return;
  const hasUser = result.messages.some((m) => (m as { role?: string }).role === 'user');
  if (!hasUser) logger.warn('PI_TRANSCRIPT_COMPACTED_NO_USER_QUERY', { outputMessages: result.messages.length });
}

/**
 * Compacts the transcript to fit `budgetTokens` (non-system part): walks
 * newest→oldest keeping whole tool units — raw when they fit, text-compressed
 * when only that fits, and dropping the unit (and everything older) otherwise.
 * The pinned system part and the pinned newest user message always survive.
 * See module doc for the wire-safety rules. Never mutates the input.
 */
export function compactTranscriptToFit(messages: ReadonlyArray<Message>, budgetTokens: number): { messages: Message[]; compacted: boolean } {
  const units = groupToolUnits(messages);
  const userIdx = newestUserUnitIndex(units);
  const reserve = userReserveTokens(units[userIdx], budgetTokens);
  const { kept, changed } = walkUnitsNewestFirst(units, userIdx, reserve, budgetTokens);
  const result = { messages: kept.flat(), compacted: changed };
  warnIfNoUserQuery(result);
  return result;
}
