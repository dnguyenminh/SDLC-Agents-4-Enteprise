/**
 * SA4E-406 — canonical text-row stacks for the final grid pass.
 *
 * Class/table attribute rows are text-only children of one container. They
 * are authored with a nominal 20px pitch but 25px text height, which creates
 * a 5px overlap. Stack them flush and round each height up to the 10px grid
 * so both row positions and row boundaries remain on-grid.
 */
import type { DiagramGraph, DiagramNode } from './drawio-parser';
import { GRID_STEP } from './drawio-geometry';
import type { Rect } from './drawio-geometry';
import { isTextRow } from './drawio-style';

export interface TextRowState {
  snapped: Map<string, Rect>;
  grown: Map<string, { w: number; h: number }>;
}

/** Stack every group of text-only container children flush, top to bottom. */
export function stackTextRows(state: TextRowState, graph: DiagramGraph): void {
  const containers = new Set(graph.containers.map(c => c.id));
  const groups = new Map<string, DiagramNode[]>();
  for (const node of graph.nodes) {
    if (!containers.has(node.parentId) || !isTextRow(node.style)) continue;
    groups.set(node.parentId, [...(groups.get(node.parentId) ?? []), node]);
  }
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const ordered = [...rows].sort((a, b) => state.snapped.get(a.id)!.y - state.snapped.get(b.id)!.y);
    let cursor = state.snapped.get(ordered[0].id)!.y;
    for (const row of ordered) {
      const current = state.snapped.get(row.id)!;
      const height = Math.max(GRID_STEP, Math.ceil(current.h / GRID_STEP) * GRID_STEP);
      state.snapped.set(row.id, { ...current, y: cursor, h: height });
      if (height !== row.height) state.grown.set(row.id, { w: row.width, h: height });
      cursor += height;
    }
  }
}
