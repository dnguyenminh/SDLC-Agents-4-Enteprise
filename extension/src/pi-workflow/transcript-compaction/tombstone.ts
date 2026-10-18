/**
 * SA4E-368 dropped-tool-activity tombstone for transcript compaction.
 * When units are dropped at the trim boundary, ONE compact text note lists
 * the dropped tool calls so the model does not re-read files it already read
 * (the UAT "review all files" loop).
 * Extracted verbatim from transcript-compaction.ts (BR-18 file-size split).
 *
 * v1.53.8 UAT — the note is a USER-role message and can never be the LAST
 * message. Assistant-role notes broke local models live: a TRAILING
 * assistant note is "continued" by llama-server models — the tombstone came
 * back VERBATIM as the whole answer (0 tool calls, ~0.4s, the "không chạy
 * được" UAT); a mid-transcript assistant note made the model claim
 * "[context window full]" and give up. A mid-transcript SYSTEM note is worse
 * — llama-server --jinja 500s ("System message must be at the beginning").
 * The USER-role note placed BEFORE the pinned newest user is the only shape
 * both wire-legal and immune to the echo.
 */
import type { Message } from '@earendil-works/pi-ai';
import { estimateWireTokens } from '../../pi-agent/prompt-compressor.js';
import { readTargetOfArgs } from '../turn-budget-guard.js';
import { isPinnedSystem, unitTokens } from './messages.js';

/** Marker every tombstone note starts with (tests + future consumers pin on it). */
export const TOMBSTONE_MARKER = '[context compacted';
/** Hard char cap for the tombstone note (≈ 80 tokens under the wire estimator). */
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

/**
 * The tombstone message: plain USER TEXT note (wire-safe — no tool blocks).
 * v1.53.8 UAT: assistant-role notes are echoed verbatim by local models when
 * they trail the transcript (and trigger "[context window full]" give-ups
 * mid-transcript) — the user role does not. See module doc.
 */
function buildTombstoneMessage(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }], timestamp: 0 } as Message;
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

/**
 * Insert position for the tombstone: the trim boundary — before the OLDEST
 * kept trimmable unit; with only pinned content left, right BEFORE the pinned
 * user. Never AFTER it (v1.53.8 UAT: a trailing note — assistant or user —
 * must not replace the newest user query as the last wire message; a trailing
 * assistant note is echoed verbatim by local models).
 */
function tombstoneUnitIndex(kept: ReadonlyArray<ReadonlyArray<Message>>, pinnedUserAt: number): number {
  for (let i = 0; i < kept.length; i++) {
    if (i === pinnedUserAt) continue;
    if (isPinnedSystem(kept[i][0])) continue;
    return i;
  }
  return pinnedUserAt >= 0 ? pinnedUserAt : kept.length;
}

/**
 * Builds the tombstone for the dropped units, making room by evicting OLDER
 * kept trimmable units — never the pinned user, never the NEWEST kept unit.
 * Returns the (possibly evicted) kept units + the tombstone message, or null
 * when no tombstone applies (no dropped tool activity / cannot fit).
 */
export function tryBuildTombstone(
  droppedUnits: ReadonlyArray<ReadonlyArray<Message>>,
  keptUnits: Message[][],
  budgetTokens: number
): { kept: Message[][]; message: Message } | null {
  const entries = harvestToolEntries(droppedUnits);
  if (entries.length === 0) return null;
  const text = buildTombstoneText(entries);
  const tombTokens = estimateWireTokens(text);
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

/** Exported for the facade's insertion step (original file kept these module-private). */
export { pinnedUserUnitIndex, tombstoneUnitIndex };
