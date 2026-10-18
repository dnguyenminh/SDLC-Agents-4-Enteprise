/**
 * Message-level helpers for transcript compaction (SA4E-355 UAT bugs 2 & 3):
 * wire-visible flattening, pinning predicates, unit token estimation, and the
 * raw/compressed keep decision for one unit.
 * Extracted verbatim from transcript-compaction.ts (BR-18 file-size split).
 */
import type { Message } from '@earendil-works/pi-ai';
import { compressPrompt, estimateWireTokens } from '../../pi-agent/prompt-compressor.js';

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
export function hasToolCall(msg: Message): boolean {
  const content = (msg as { content?: unknown }).content;
  return Array.isArray(content) && content.some((b) => (b as { type?: string })?.type === 'toolCall');
}

/** System messages are the fixed part (prompt + tool declarations) — pinned. */
export function isPinnedSystem(msg: Message): boolean {
  return (msg as { role?: string }).role === 'system';
}

/** Copy of the message with text/thinking blocks compressed (UC-03). ToolCall blocks stay intact. */
export function compressMessageText(msg: Message): Message {
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

/** Estimated tokens of one unit (conservative wire estimator over the flattened wire text). */
export function unitTokens(unit: ReadonlyArray<Message>): number {
  return unit.reduce((sum, m) => sum + estimateWireTokens(flattenContent((m as { content?: unknown }).content)), 0);
}

/** Kept form of one unit: `{ messages, tokens, compressed }`. */
export interface KeptUnit {
  messages: Message[]; tokens: number; compressed: boolean;
}

/** Kept form of one unit — raw, compressed, or null when neither fits `budgetLeft`. */
export function fitUnit(unit: Message[], budgetLeft: number): KeptUnit | null {
  const rawTokens = unitTokens(unit);
  if (rawTokens <= budgetLeft) return { messages: unit, tokens: rawTokens, compressed: false };
  const compressed = unit.map(compressMessageText);
  const compressedTokens = unitTokens(compressed);
  if (compressedTokens <= budgetLeft) return { messages: compressed, tokens: compressedTokens, compressed: true };
  return null;
}
