/**
 * draw.io style-string predicates for sequence-diagram constructs that are
 * designed to overlap or be crossed (UML lifelines, combined fragments).
 */

/** UML lifeline — sequence-diagram vertical band, never a layout obstacle. */
export function isSequenceLifeline(style: string): boolean {
  return style.includes('umlLifeline');
}

/** Large dashed frame — UML combined fragment / region indicator. */
export function isFragmentFrame(style: string, w: number, h: number): boolean {
  const s = style.toLowerCase();
  return s.includes('dashed=1') && w > 200 && h > 60;
}

/** Label row (	ext shape) — the building block of class boxes and tables, stacked flush on purpose. */
export function isTextRow(style: string): boolean {
  return /(^|;)text(;|$)/.test(style);
}

/**
 * Rebuild a style string: drop the given keys (bare tokens such as `ellipse` count
 * as keys) and append `add`. Order of the kept tokens is preserved, so applying
 * the same rewrite twice yields the same string.
 * @param style - draw.io style string
 * @param drop - keys owned by the caller (removed before `add` is appended)
 * @param add - `key=value` tokens to append
 */
export function rewriteStyle(style: string, drop: ReadonlySet<string>, add: string[]): string {
  const tokens = [...style.split(';').filter(t => t.trim() !== '' && !drop.has(t.split('=')[0])), ...add];
  return tokens.length ? tokens.join(';') + ';' : '';
}
