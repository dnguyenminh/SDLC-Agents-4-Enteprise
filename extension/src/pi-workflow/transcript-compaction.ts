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
 *   toolCall blocks stay intact for id pairing;
 * - SA4E-368 DROPPED-TOOL-ACTIVITY TOMBSTONE: when units are dropped, ONE
 *   compact assistant text note is inserted at the trim boundary listing the
 *   dropped tool calls (e.g. "read src/a.ts"). Without it the model loses
 *   all memory of files it already read — the UAT "review all files" loop:
 *   compaction drops the old read results → the model re-reads the same
 *   files → the request grows → compaction drops more → re-read again
 *   (162 tool calls until the loop guard killed the turn). The tombstone
 *   costs at most TOMBSTONE_TOKEN_CAP tokens, paid by evicting OLDER kept
 *   units — never the pinned user, never the NEWEST kept unit (the newest
 *   content outranks the breadcrumb). No tombstone when nothing was dropped
 *   or the dropped units carry no toolCall blocks.
 *
 * Never mutates the input; returns a new array.
 */
import type { Message } from '@earendil-works/pi-ai';
import { compressPrompt, estimateTokenCount } from '../pi-agent/prompt-compressor.js';
import { readTargetOfArgs } from './turn-budget-guard.js';
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

/** Walk outcome: kept units (original order) + the units the trim dropped. */
interface WalkOutcome {
  kept: Message[][];
  dropped: Message[][];
  changed: boolean;
}

/** Keeps the pinned newest user unit — raw when it fits, compressed otherwise; never dropped. */
function keepPinnedUser(unit: Message[], budgetTokens: number, state: WalkState, kept: Message[][]): void {
  const fit = fitPinnedUser(unit, budgetTokens - state.total);
  kept.unshift(fit.messages);
  state.total += fit.tokens;
  state.changed = state.changed || fit.compressed;
}

/** Keeps one trimmable unit, or sets the trim point when it cannot fit. */
function keepTrimmable(unit: Message[], budgetLeft: number, state: WalkState, kept: Message[][], dropped: Message[][]): void {
  const fit = fitUnit(unit, budgetLeft);
  if (fit) {
    kept.unshift(fit.messages);
    state.total += fit.tokens;
    state.changed = state.changed || fit.compressed;
    return;
  }
  state.overflowed = true; // this unit (and everything older but unpinned) cannot fit
  dropped.push(unit);
  state.changed = true;
}

/** Walks units newest→oldest: pinned systems and the pinned newest user survive past the trim point; other units fit the reserve-aware budget or trim everything older. */
function walkUnitsNewestFirst(units: Message[][], userIdx: number, reserve: number, budgetTokens: number): WalkOutcome {
  const kept: Message[][] = [];
  const dropped: Message[][] = [];
  const state: WalkState = { total: 0, changed: false, overflowed: false };
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    if (isPinnedSystem(unit[0])) {
      kept.unshift(unit); // pinned fixed part — survives even past the trim point
    } else if (i === userIdx) {
      keepPinnedUser(unit, budgetTokens, state, kept); // pinned newest user query
    } else if (state.overflowed) {
      dropped.push(unit); // older non-pinned units are dropped (trim-oldest-first)
      state.changed = true;
    } else {
      keepTrimmable(unit, budgetTokens - reserve - state.total, state, kept, dropped);
    }
  }
  return { kept, dropped, changed: state.changed };
}

/** Defensive post-check (bug 3): compaction must keep a user query or the provider's chat template 500s — warn (never crash) on exotic userless transcripts. */
function warnIfNoUserQuery(result: { messages: Message[]; compacted: boolean }): void {
  if (!result.compacted) return;
  const hasUser = result.messages.some((m) => (m as { role?: string }).role === 'user');
  if (!hasUser) logger.warn('PI_TRANSCRIPT_COMPACTED_NO_USER_QUERY', { outputMessages: result.messages.length });
}

/* ── SA4E-368: dropped-tool-activity tombstone ─────────────────────────── */

/** Marker every tombstone note starts with (tests + future consumers pin on it). */
export const TOMBSTONE_MARKER = '[context compacted';
/** Hard char cap for the tombstone note (≈ 60 tokens under chars/4). */
const TOMBSTONE_MAX_CHARS = 240;
/** At most this many dropped tool calls are listed; the rest collapse to "+N more". */
const TOMBSTONE_MAX_ENTRIES = 8;

/** One dropped tool call worth remembering: `name target` (target optional). */
function harvestToolEntries(droppedUnits: ReadonlyArray<ReadonlyArray<Message>>): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();
  for (const unit of droppedUnits) {
    for (const msg of unit) {
      const content = (msg as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block as { type?: string; name?: unknown; arguments?: unknown };
        if (b?.type !== 'toolCall' || typeof b.name !== 'string') continue;
        const entry = `${b.name} ${readTargetOfArgs(b.arguments)}`.trim();
        if (!entry || seen.has(entry)) continue;
        seen.add(entry);
        entries.push(entry);
      }
    }
  }
  return entries;
}

/** Compact breadcrumb text listing the dropped tool activity. */
function buildTombstoneText(entries: ReadonlyArray<string>): string {
  const shown = entries.slice(0, TOMBSTONE_MAX_ENTRIES);
  const more = entries.length - shown.length;
  let text =
    `${TOMBSTONE_MARKER} — earlier tool results were removed to fit the context window; ` +
    `do NOT repeat these calls: ${shown.join('; ')}` +
    (more > 0 ? `; +${more} more` : '') + ']';
  if (text.length > TOMBSTONE_MAX_CHARS) text = text.slice(0, TOMBSTONE_MAX_CHARS - 1) + ']';
  return text;
}

/** The tombstone message: plain assistant TEXT (wire-safe — no tool blocks). */
function buildTombstoneMessage(text: string): Message {
  return { role: 'assistant', content: [{ type: 'text', text }], timestamp: 0 } as Message;
}

/** Index of the LAST 'user' unit in kept (original order) — the pinned newest user. */
function pinnedUserUnitIndex(kept: ReadonlyArray<ReadonlyArray<Message>>): number {
  let at = -1;
  for (let i = 0; i < kept.length; i++) {
    if ((kept[i][0] as { role?: string }).role === 'user') at = i;
  }
  return at;
}

/** Index of the LAST trimmable kept unit (non-system, not the pinned user) — the NEWEST kept unit. */
function newestTrimmableUnitIndex(kept: ReadonlyArray<ReadonlyArray<Message>>, pinnedUserAt: number): number {
  let at = -1;
  for (let i = 0; i < kept.length; i++) {
    if (i === pinnedUserAt) continue;
    if (isPinnedSystem(kept[i][0])) continue;
    at = i;
  }
  return at;
}

/** Insert position for the tombstone: the trim boundary — before the OLDEST kept trimmable unit, falling back to right after the pinned user. */
function tombstoneUnitIndex(kept: ReadonlyArray<ReadonlyArray<Message>>, pinnedUserAt: number): number {
  for (let i = 0; i < kept.length; i++) {
    if (i === pinnedUserAt) continue;
    if (isPinnedSystem(kept[i][0])) continue;
    return i;
  }
  return pinnedUserAt >= 0 ? pinnedUserAt + 1 : kept.length;
}

/**
 * Builds the tombstone for the dropped units, making room by evicting OLDER
 * kept trimmable units — never the pinned user, never the NEWEST kept unit.
 * Returns the (possibly evicted) kept units + the tombstone message, or null
 * when no tombstone applies (no dropped tool activity / cannot fit).
 */
function tryBuildTombstone(
  droppedUnits: ReadonlyArray<ReadonlyArray<Message>>,
  keptUnits: Message[][],
  budgetTokens: number
): { kept: Message[][]; message: Message } | null {
  const entries = harvestToolEntries(droppedUnits);
  if (entries.length === 0) return null;
  const text = buildTombstoneText(entries);
  const tombTokens = estimateTokenCount(text);
  const kept = [...keptUnits];
  const keptTokens = () => kept.reduce((sum, u) => sum + unitTokens(u), 0);
  while (keptTokens() + tombTokens > budgetTokens) {
    const pinnedUserAt = pinnedUserUnitIndex(kept);
    const newestTrimmableAt = newestTrimmableUnitIndex(kept, pinnedUserAt);
    // Evict the OLDEST evictable unit: trimmable, not pinned user, not the newest.
    let evictAt = -1;
    for (let i = 0; i < kept.length; i++) {
      if (i === pinnedUserAt || i === newestTrimmableAt) continue;
      if (isPinnedSystem(kept[i][0])) continue;
      evictAt = i;
      break;
    }
    if (evictAt === -1) return null; // cannot fit without sacrificing pinned/newest — skip
    kept.splice(evictAt, 1);
  }
  return { kept, message: buildTombstoneMessage(text) };
}

/**
 * Compacts the transcript to fit `budgetTokens` (non-system part): walks
 * newest→oldest keeping whole tool units — raw when they fit, text-compressed
 * when only that fits, and dropping the unit (and everything older) otherwise.
 * The pinned system part and the pinned newest user message always survive.
 * SA4E-368: when units are dropped, a tombstone note is inserted at the trim
 * boundary listing the dropped tool activity (see module doc). Never mutates
 * the input.
 */
export function compactTranscriptToFit(messages: ReadonlyArray<Message>, budgetTokens: number): { messages: Message[]; compacted: boolean } {
  const units = groupToolUnits(messages);
  const userIdx = newestUserUnitIndex(units);
  const reserve = userReserveTokens(units[userIdx], budgetTokens);
  const walk = walkUnitsNewestFirst(units, userIdx, reserve, budgetTokens);
  let kept = walk.kept;
  if (walk.dropped.length > 0) {
    const tombstone = tryBuildTombstone(walk.dropped, kept, budgetTokens);
    if (tombstone) {
      kept = tombstone.kept;
      kept.splice(tombstoneUnitIndex(kept, pinnedUserUnitIndex(kept)), 0, [tombstone.message]);
    }
  }
  const result = { messages: kept.flat(), compacted: walk.changed };
  warnIfNoUserQuery(result);
  return result;
}
