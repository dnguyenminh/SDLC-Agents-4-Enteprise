/**
 * Trim-point walk for transcript compaction (SA4E-355 UAT bugs 2 & 3):
 * groups the transcript into atomic tool units and walks them newest→oldest,
 * pinning system messages and the newest user query, trimming the rest.
 * Extracted verbatim from transcript-compaction.ts (BR-18 file-size split).
 */
import type { Message } from '@earendil-works/pi-ai';
import { logger } from '../../logger';
import {
  compressMessageText,
  fitUnit,
  hasToolCall,
  isPinnedSystem,
  unitTokens,
  type KeptUnit,
} from './messages.js';

/** Groups the transcript into atomic units — the ONLY safe trim boundary (see facade doc). */
export function groupToolUnits(messages: ReadonlyArray<Message>): Message[][] {
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

/** Index of the newest standalone user-message unit, or -1 when none exists. */
export function newestUserUnitIndex(units: Message[][]): number {
  for (let i = units.length - 1; i >= 0; i--) {
    if ((units[i][0] as { role?: string }).role === 'user') return i;
  }
  return -1;
}

/** Budget reserved up-front for the pinned newest user unit: raw size when it fits the whole budget, else compressed size when that fits, else 0 (BR-09 reject path). */
export function userReserveTokens(unit: Message[] | undefined, budgetTokens: number): number {
  if (!unit) return 0;
  const rawTokens = unitTokens(unit);
  if (rawTokens <= budgetTokens) return rawTokens;
  const compressedTokens = unitTokens(unit.map(compressMessageText));
  return compressedTokens <= budgetTokens ? compressedTokens : 0;
}

/** Kept form of the PINNED newest user unit — never null: reuses `fitUnit` and falls back to the compressed unit even when over budget (the caller's BR-09 gate REJECTS, no provider 500). */
export function fitPinnedUser(unit: Message[], budgetLeft: number): KeptUnit {
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
export interface WalkOutcome {
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
export function walkUnitsNewestFirst(units: Message[][], userIdx: number, reserve: number, budgetTokens: number): WalkOutcome {
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
export function warnIfNoUserQuery(result: { messages: Message[]; compacted: boolean }): void {
  if (!result.compacted) return;
  const hasUser = result.messages.some((m) => (m as { role?: string }).role === 'user');
  if (!hasUser) logger.warn('PI_TRANSCRIPT_COMPACTED_NO_USER_QUERY', { outputMessages: result.messages.length });
}
