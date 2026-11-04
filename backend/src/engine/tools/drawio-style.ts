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
