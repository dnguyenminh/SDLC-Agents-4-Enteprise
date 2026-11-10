/**
 * SA4E-406 — grid lines for the orthogonal edge router.
 * One axis = the distinct coordinates where a route may run or turn.
 */

const LANE_GAP_MIN = 40; // gutters at least this wide get a centre lane
const LANE_OFFSET = 12; // extra lanes either side of the centre for wide gutters

/** Round to 0.01 px so equal coordinates compare equal as map keys. */
export const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Sorted unique axis lines: given values plus lanes through wide gaps. */
export function buildAxis(values: number[], withLanes: boolean): number[] {
  const base = [...new Set(values.map(r2))].sort((a, b) => a - b);
  if (!withLanes) return base;
  const out = new Set(base);
  for (let i = 1; i < base.length; i++) {
    const gap = base[i] - base[i - 1];
    if (gap < LANE_GAP_MIN) continue;
    const mid = (base[i] + base[i - 1]) / 2;
    out.add(r2(mid));
    if (gap >= 2 * LANE_GAP_MIN) { out.add(r2(mid - LANE_OFFSET)); out.add(r2(mid + LANE_OFFSET)); }
  }
  return [...out].sort((a, b) => a - b);
}
