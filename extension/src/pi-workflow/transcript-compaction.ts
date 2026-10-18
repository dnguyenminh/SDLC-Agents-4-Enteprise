/**
 * Transcript compaction mechanics — SA4E-355 UAT bugs 2 & 3 (public facade).
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
 * - v1.53.8 UAT — the note is a USER-role message and can never be the LAST
 *   message (assistant-role notes get echoed verbatim by local models; see
 *   transcript-compaction/tombstone.ts for the full rationale).
 *
 * Never mutates the input; returns a new array.
 *
 * Implementation lives in sibling submodules under `transcript-compaction/`
 * (BR-18 file-size split); this facade re-exports the SAME public symbols at
 * the SAME import path — no caller changes.
 */
import type { Message } from '@earendil-works/pi-ai';
import {
  groupToolUnits,
  newestUserUnitIndex,
  userReserveTokens,
  walkUnitsNewestFirst,
  warnIfNoUserQuery,
} from './transcript-compaction/compaction-walk.js';
import { tryBuildTombstone, pinnedUserUnitIndex, tombstoneUnitIndex } from './transcript-compaction/tombstone.js';

export { flattenContent } from './transcript-compaction/messages.js';
export { TOMBSTONE_MARKER } from './transcript-compaction/tombstone.js';

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
