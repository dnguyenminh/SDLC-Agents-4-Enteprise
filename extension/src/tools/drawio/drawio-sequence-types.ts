/**
 * SA4E-406 — shared types, spacing constants and text metrics of the sequence
 * diagram layout (plan, fragments, rows, XML writer).
 */

import type { TCell } from './drawio-table-cells';

/** Planned participant: lifeline cell geometry plus header (box/actor) height. */
export interface ParticipantPlan { id: string; x: number; y: number; width: number; height: number; header: number; actor: boolean; }
/** Planned message: row y (absolute) and the two lifeline fractions. */
export interface MessagePlan { id: string; source: string; target: string; y: number; self: boolean; loopX: number; }
/** A shape moved to a computed rect (fragment frame, divider, label). */
export interface PlacedRect {
  id: string; x: number; y: number; w: number; h: number;
  /** Set for a divider that is an edge without terminals: written back as two points. */
  edge?: { reverse: boolean };
}
export interface SequencePlan {
  participants: ParticipantPlan[];
  messages: MessagePlan[];
  /** Unlabelled edges that only duplicate a labelled message (same source→target). */
  redundant: string[];
  notes: Array<{ id: string; x: number; y: number }>;
  /** Combined-fragment frames (alt / loop / opt …), outermost first. */
  fragments: PlacedRect[];
  /** Dividers (`else` lines) and labels that belong to a fragment. */
  furniture: PlacedRect[];
  /** Frames that enclose no message (the file gives no positions): left as notes. */
  unmatchedFrames: string[];
  /** Dividers placed mid-frame because the file gives no message positions. */
  guessedDividers: string[];
  /** Lifeline top / bottom (absolute). */
  top: number; bottom: number;
}

export const MARGIN = 40;
export const ROW_STEP = 44;
export const SELF_LOOP_W = 36;
export const SELF_LOOP_H = 28;

const DEFAULT_FONT = 11;
const CHAR_W = 0.58; // average glyph width / font size for draw.io's default sans font

/** Width of the longest line of a cell's label (entities and markup removed). */
export function labelWidth(c: TCell): number {
  const font = Number(/(?:^|;)fontSize=([\d.]+)/.exec(c.style)?.[1] ?? DEFAULT_FONT);
  const text = c.value.replace(/&#x?a;|&#10;|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&[#\w]+;/g, ' ');
  const longest = Math.max(0, ...text.split('\n').map(l => l.trim().length));
  return longest * font * CHAR_W;
}
