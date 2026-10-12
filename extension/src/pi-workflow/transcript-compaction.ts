/**
 * Transcript compaction mechanics — SA4E-355 UAT bug 2.
 *
 * Compacts a pi-ai transcript (`Message[]`) to a token budget WITHOUT
 * breaking the wire contract:
 * - trim-oldest-first at TOOL-UNIT granularity: an assistant toolCall message
 *   and the toolResult messages that follow it are atomic — separating them
 *   makes the provider 400 on the orphaned pairing (the very error class the
 *   intra-turn budget gate prevents);
 * - system messages (prompt + tool declarations) are PINNED — always kept;
 * - a unit that does not fit raw is kept with its text/thinking COMPRESSED
 *   (UC-03 `compressPrompt`); toolCall blocks stay intact for id pairing;
 * - the NEWEST non-system unit is never dropped — a system-only transcript is
 *   not respondable, so the caller REJECTS instead (BR-09).
 *
 * Never mutates the input; returns a new array.
 */
import type { Message } from '@earendil-works/pi-ai';
import { compressPrompt, estimateTokenCount } from '../pi-agent/prompt-compressor.js';

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

/**
 * Groups the transcript into atomic units: an assistant toolCall message plus
 * the toolResult messages that follow it, or single messages otherwise. Units
 * are the ONLY safe trim boundary (see module doc).
 */
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

/** Kept form of one unit — raw, compressed, or null when neither fits `budgetLeft`. */
function fitUnit(unit: Message[], budgetLeft: number): { messages: Message[]; tokens: number; compressed: boolean } | null {
  const rawTokens = unitTokens(unit);
  if (rawTokens <= budgetLeft) return { messages: unit, tokens: rawTokens, compressed: false };
  const compressed = unit.map(compressMessageText);
  const compressedTokens = unitTokens(compressed);
  if (compressedTokens <= budgetLeft) return { messages: compressed, tokens: compressedTokens, compressed: true };
  return null;
}

/**
 * Compacts the transcript to fit `budgetTokens` (non-system part): walks
 * newest→oldest keeping whole tool units — raw when they fit, text-compressed
 * when only that fits, and dropping the unit (and everything older) otherwise.
 * See module doc for the wire-safety rules. Never mutates the input.
 */
export function compactTranscriptToFit(
  messages: ReadonlyArray<Message>,
  budgetTokens: number
): { messages: Message[]; compacted: boolean } {
  const units = groupToolUnits(messages);
  const kept: Message[][] = [];
  let total = 0;
  let changed = false;
  let overflowed = false;
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    if (isPinnedSystem(unit[0])) {
      kept.unshift(unit); // pinned fixed part — survives even past the trim point
      continue;
    }
    if (overflowed) {
      changed = true; // older non-pinned units are dropped (trim-oldest-first)
      continue;
    }
    const fit = fitUnit(unit, budgetTokens - total);
    if (fit) {
      kept.unshift(fit.messages);
      total += fit.tokens;
      changed = changed || fit.compressed;
    } else {
      overflowed = true; // this unit (and everything older) cannot fit
      changed = true;
    }
  }
  return { messages: kept.flat(), compacted: changed };
}
