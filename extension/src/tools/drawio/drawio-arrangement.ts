/**
 * SA4E-406 — the arrangement the author gave to root-level boxes (bands, lanes).
 * Relayout must respect it: three architecture layers drawn one above the other
 * stay stacked, they are not turned into side-by-side columns.
 * Pure geometry over the ORIGINAL root-level rects (absolute page coordinates).
 */

/** Minimal rect view of a root-level cell. */
export interface ArrangedBox { id: string; x: number; y: number; width: number; height: number; }

/** 'column' = stacked top→bottom, 'row' = side by side left→right, null = anything else. */
export type Arrangement = 'column' | 'row';

/**
 * Classify how boxes were placed. Needs ≥2 boxes. A column means, in y order,
 * each box starts below the previous one and shares horizontal extent with it.
 * @param boxes Root-level boxes with their original geometry
 * @returns The arrangement, or null when the boxes form no single row/column
 */
export function detectArrangement(boxes: ArrangedBox[]): Arrangement | null {
  if (boxes.length < 2) return null;
  if (isChain(boxes, 'y')) return 'column';
  if (isChain(boxes, 'x')) return 'row';
  return null;
}

/** Hand-drawn touch overlap: a few px of overlap is a touch, more is a real overlap. */
const OVERLAP_TOL = 2;

/**
 * Ids in the order the author placed them along the arrangement's axis.
 * @param boxes Root-level boxes with their original geometry
 * @param arrangement Axis to sort along
 */
export function orderAlong(boxes: ArrangedBox[], arrangement: Arrangement): string[] {
  const key = arrangement === 'column' ? 'y' : 'x';
  return [...boxes].sort((a, b) => a[key] - b[key]).map(b => b.id);
}

/** Sorted along `axis`, every neighbour pair touches (within tolerance) and overlaps on the other axis. */
function isChain(boxes: ArrangedBox[], axis: 'x' | 'y'): boolean {
  const size = axis === 'y' ? 'height' : 'width';
  const cross = axis === 'y' ? 'x' : 'y';
  const crossSize = axis === 'y' ? 'width' : 'height';
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);
  return sorted.every((b, i) => {
    if (i === 0) return true;
    const prev = sorted[i - 1];
    const prevEnd = prev[axis] + prev[size];
    // Overlap = how far b starts BEFORE prev ends (negative = gap). Touching
    // overlap up to OVERLAP_TOL keeps the chain (any gap is fine — stacked
    // bands breathe); a 10 px overlap is a real overlap, not a touch
    // (SA4E-406 regression: TOUCH_TOL used to accept it).
    const overlap = prevEnd - b[axis];
    const disjoint = overlap <= OVERLAP_TOL;
    // A box nested inside the previous one is not the next chain step.
    const contained = b[axis] + b[size] <= prevEnd;
    const shared = Math.min(prev[cross] + prev[crossSize], b[cross] + b[crossSize]) - Math.max(prev[cross], b[cross]);
    return disjoint && !contained && shared > 0;
  });
}
