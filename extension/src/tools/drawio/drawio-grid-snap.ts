/**
 * SA4E-406 (f)/(b) — final grid pass: snap every vertex to the 10px grid,
 * spread bunched siblings, grow containers, rewrite parent-relative.
 * Idempotent: on grid-clean input nothing moves. Edge cells never touched.
 * PD-QA1: ports-only path skips debunch/separateContainers (node positions kept).
 */
import { parseDrawioXml, type DiagramGraph, type DiagramNode } from './drawio-parser';
import { GRID_STEP, absoluteRects, cellIndex, rectGap, snapToGrid, type Rect } from './drawio-geometry';
import { isTextRow } from './drawio-style';
import { containerInsets } from './drawio-container-insets';
import { patchGeometryTag, hasAttr, replaceAttr, insertAttrs, round } from './drawio-xml-utils';
import { rewriteCells, type CellPatch } from './drawio-xml-rewrite';
import { stackTextRows } from './drawio-grid-rows';
import { detectThresholds } from './drawio-detect';
/** Working state: byId index + the target (snapped/de-bunched) absolute rects. */
interface SnapCtx {
  byId: Map<string, DiagramNode>;
  snapped: Map<string, Rect>;
  grown: Map<string, { w: number; h: number }>;
}
/** Snap all vertex coordinates to the grid and spread bunched siblings. */
export function snapDiagramToGrid(xml: string, opts?: { portsOnly?: boolean }): string {
  const graph = parseDrawioXml(xml);
  const ctx = buildCtx(graph);
  // PD-QA1: ports-only path skips debunch/separateContainers — node positions kept.
  if (!opts?.portsOnly) {
    stackTextRows(ctx, graph);
    debunch(ctx, graph);
    separateContainers(ctx, graph);
  }
  regrowContainers(ctx, graph);
  return writePositions(xml, ctx, graph);
}
/** Absolute rects of the parsed graph, x/y snapped to the grid. */
function buildCtx(graph: DiagramGraph): SnapCtx {
  const byId = cellIndex(graph);
  const snapped = new Map<string, Rect>();
  for (const [id, r] of absoluteRects(graph)) {
    snapped.set(id, { ...r, x: snapToGrid(r.x), y: snapToGrid(r.y) });
  }
  return { byId, snapped, grown: new Map() };
}
/** Sibling node pairs in one scope (same parent, or both top-level), stable order. */
function siblingPairs(graph: DiagramGraph): Array<[DiagramNode, DiagramNode]> {
  const nodes = graph.nodes;
  const pairs: Array<[DiagramNode, DiagramNode]> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.parentId !== b.parentId && !(a.parentId === '1' && b.parentId === '1')) continue;
      if (isTextRow(a.style) && isTextRow(b.style)) continue; // rows stack flush by design
      pairs.push([a, b]);
    }
  }
  return pairs;
}
/** Push bunched siblings apart in grid steps until stable (bounded passes). */
function debunch(ctx: SnapCtx, graph: DiagramGraph): void {
  const pairs = siblingPairs(graph);
  const required = detectThresholds().gap;
  for (let pass = 0; pass < 8; pass++) {
    let pushed = false;
    for (const [a, b] of pairs) {
      if (spreadPair(ctx, a.id, b.id, required)) pushed = true;
    }
    if (!pushed) return;
  }
}
/** One grid-aligned push for a too-close pair; true when something moved. */
function spreadPair(ctx: SnapCtx, aId: string, bId: string, required: number): boolean {
  const ra = ctx.snapped.get(aId)!, rb = ctx.snapped.get(bId)!;
  if (rectGap(ra, rb) >= required) return false;
  const sepX = Math.max(ra.x - (rb.x + rb.w), rb.x - (ra.x + ra.w));
  const sepY = Math.max(ra.y - (rb.y + rb.h), rb.y - (ra.y + ra.h));
  const alongX = sepX >= sepY;
  const need = Math.ceil((required - Math.max(sepX, sepY)) / GRID_STEP) * GRID_STEP;
  shiftCell(ctx, alongX
    ? (ra.x + ra.w / 2 <= rb.x + rb.w / 2 ? bId : aId)
    : (ra.y + ra.h / 2 <= rb.y + rb.h / 2 ? bId : aId),
    alongX ? { x: need, y: 0 } : { x: 0, y: need });
  return true;
}
/** Move one cell's target rect by a grid-aligned delta. */
function shiftCell(ctx: SnapCtx, id: string, d: { x: number; y: number }): void {
  const r = ctx.snapped.get(id)!;
  ctx.snapped.set(id, { ...r, x: r.x + d.x, y: r.y + d.y });
}
/** Push overlapping SIBLING containers apart, grid-aligned, until clear. */
function separateContainers(ctx: SnapCtx, graph: DiagramGraph): void {
  const containers = graph.containers;
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < containers.length; i++) {
      for (let j = i + 1; j < containers.length; j++) {
        const a = containers[i], b = containers[j];
        if (a.parentId !== b.parentId && !(a.parentId === '1' && b.parentId === '1')) continue;
        moved = pushApart(ctx, a.id, b.id) || moved;
      }
    }
    if (!moved) return;
  }
}
/** One grid-aligned push for an overlapping sibling-container pair. */
function pushApart(ctx: SnapCtx, aId: string, bId: string): boolean {
  const ra = ctx.snapped.get(aId)!, rb = ctx.snapped.get(bId)!;
  const ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
  const oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
  if (ox <= 0 || oy <= 0) return false;
  if (containsRect(ra, rb) || containsRect(rb, ra)) return false;
  const byId = ctx.byId;
  const descendants = (root: string): string[] => {
    const out: string[] = [];
    for (const [id, cell] of byId) {
      if (id === root) continue;
      for (let p = cell.parentId; p && byId.has(p); p = byId.get(p)!.parentId) {
        if (p === root) { out.push(id); break; }
      }
    }
    return out;
  };
  if (ox <= oy) {
    const mover = ra.x + ra.w / 2 <= rb.x + rb.w / 2 ? bId : aId;
    shiftSubtree(ctx, mover, descendants(mover), { x: snapToGrid(ox + GRID_STEP), y: 0 });
  } else {
    const mover = ra.y + ra.h / 2 <= rb.y + rb.h / 2 ? bId : aId;
    shiftSubtree(ctx, mover, descendants(mover), { x: 0, y: snapToGrid(oy + GRID_STEP) });
  }
  return true;
}
function containsRect(outer: Rect, inner: Rect): boolean {
  return outer.x <= inner.x && outer.y <= inner.y
    && outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;
}
/** Move a container and every descendant rect by one grid-aligned delta. */
function shiftSubtree(ctx: SnapCtx, rootId: string, descendants: string[], d: { x: number; y: number }): void {
  for (const id of [rootId, ...descendants]) {
    const r = ctx.snapped.get(id);
    if (r) ctx.snapped.set(id, { ...r, x: r.x + d.x, y: r.y + d.y });
  }
}
/** Grow containers whose snapped children escape them (deepest first). */
function regrowContainers(ctx: SnapCtx, graph: DiagramGraph): void {
  const depth = (id: string): number => {
    let n = 0;
    for (let p = ctx.byId.get(id)?.parentId; p && ctx.byId.has(p); p = ctx.byId.get(p)?.parentId) n++;
    return n;
  };
  const containers = [...graph.containers].sort((a, b) => depth(b.id) - depth(a.id));
  for (const c of containers) {
    const kids = [...graph.nodes, ...graph.containers].filter(k => k.parentId === c.id);
    const rc = ctx.snapped.get(c.id)!;
    if (kids.length === 0) continue;
    const insets = containerInsets(c.style);
    let maxR = 0, maxB = 0;
    for (const k of kids) {
      const rk = ctx.snapped.get(k.id)!;
      maxR = Math.max(maxR, rk.x + rk.w - rc.x);
      maxB = Math.max(maxB, rk.y + rk.h - rc.y);
    }
    const w = Math.max(c.width, snapToGrid(maxR + insets.right));
    const h = Math.max(c.height, snapToGrid(maxB + insets.bottom));
    if (w > c.width + 0.5 || h > c.height + 0.5) {
      ctx.grown.set(c.id, { w, h });
      ctx.snapped.set(c.id, { ...rc, w, h });
    }
  }
}
/** Rewrite every vertex parent-relative so the absolute chain stays on-grid. */
function writePositions(xml: string, ctx: SnapCtx, graph: DiagramGraph): string {
  const geometryPatches = new Map<string, (open: string, body: string) => CellPatch | null>();
  for (const cell of [...graph.containers, ...graph.nodes]) {
    const abs = ctx.snapped.get(cell.id)!;
    const p = ctx.snapped.get(cell.parentId);
    const x = abs.x - (p ? p.x : 0);
    const y = abs.y - (p ? p.y : 0);
    if (Math.abs(x - cell.x) < 0.01 && Math.abs(y - cell.y) < 0.01) continue;
    geometryPatches.set(cell.id, (_open, body) => {
      const patched = patchGeometryTag(body, (tag) => {
        let out = hasAttr(tag, 'x') ? replaceAttr(tag, 'x', x) : insertAttrs(tag, ` x="${round(x)}"`);
        out = hasAttr(out, 'y') ? replaceAttr(out, 'y', y) : insertAttrs(out, ` y="${round(y)}"`);
        return out;
      });
      return patched === null ? null : { open: _open, body: patched };
    });
  }
  const sizePatches = new Map<string, (open: string, body: string) => CellPatch | null>();
  for (const [id, size] of ctx.grown) {
    sizePatches.set(id, (_open, body) => {
      const patched = patchGeometryTag(body, (tag) => {
        let out = hasAttr(tag, 'width') ? replaceAttr(tag, 'width', size.w) : tag;
        out = hasAttr(out, 'height') ? replaceAttr(out, 'height', size.h) : out;
        return out;
      });
      return patched === null ? null : { open: _open, body: patched };
    });
  }
  let out = rewriteCells(xml, geometryPatches);
  out = rewriteCells(out, sizePatches);
  return out;
}
