/**
 * SA4E-410 (DISC-3) — Types for draw.io flattening.
 */

interface Cell {
  id: string;
  isEdge: boolean;
  /** Raw opening-tag attributes (without the tag name). */
  attrs: string;
  /** Inner XML of the cell WITHOUT its physically nested cells. */
  ownInner: string;
  /** Text (usually XML comments) that preceded this cell in the source. */
  leading: string;
  hasGeometry: boolean;
  /** Index in document order. */
  order: number;
  /** Physical XML nesting depth: 1 = direct child of `<root>`. */
  xmlDepth: number;
}

/** A byte range inside a string. */
interface Range {
  start: number;
  end: number;
}

const AMP = String.fromCharCode(38) + 'amp;';
const LT = String.fromCharCode(38) + 'lt;';
const GT = String.fromCharCode(38) + 'gt;';
const QUOT = String.fromCharCode(38) + 'quot;';

export type { Cell, Range };
export { AMP, LT, GT, QUOT };