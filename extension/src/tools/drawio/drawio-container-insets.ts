/**
 * SA4E-406 — inner padding of a container, derived from its style.
 *
 * A swimlane reserves a title strip (`startSize`) on its top edge, or on its
 * left edge when `horizontal=0`. Children must start beyond that strip, or
 * they are drawn over the title. Non-swimlane boundary boxes have no header.
 */

export interface Insets { top: number; left: number; right: number; bottom: number; }

/** Plain margin around children. */
const MARGIN = 20;
/** Breathing room between the title strip and the first child. */
const HEADER_GAP = 14;
/** draw.io's default swimlane title thickness when `startSize` is absent. */
const DEFAULT_START_SIZE = 23;

/** True when the style describes a swimlane (title strip) container. */
export function isSwimlane(style: string): boolean {
  return /(^|;)swimlane(;|$)/.test(style);
}

/** True when the swimlane title strip runs along the top (default), false for `horizontal=0`. */
export function titleOnTop(style: string): boolean {
  return !/(^|;)horizontal=0(;|$)/.test(style);
}

/** Title strip thickness in px (0 for non-swimlanes). */
export function headerThickness(style: string): number {
  if (!isSwimlane(style)) return 0;
  const m = /(^|;)startSize=([\d.]+)/.exec(style);
  return m ? Number(m[2]) : DEFAULT_START_SIZE;
}

/** Padding that keeps children clear of the container's title strip. */
export function containerInsets(style: string): Insets {
  const base: Insets = { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN };
  const header = headerThickness(style);
  if (header === 0) return base;
  return titleOnTop(style)
    ? { ...base, top: header + HEADER_GAP }
    : { ...base, left: header + HEADER_GAP };
}
