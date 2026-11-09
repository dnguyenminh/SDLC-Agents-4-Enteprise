/**
 * Serialize ELK layout results back into draw.io XML.
 *
 * Key invariants:
 * - draw.io child geometry is relative to the parent cell; ELK returns child
 *   coordinates relative to their containing node, so nested positions are
 *   written as-is while ROOT-level positions get the global normalize shift.
 *   (Shifting both would double-move nested nodes.)
 * - Edge sections live in the coordinate space of the ELK node that owns them
 *   (root or container), which matches the draw.io edge-parent space.
 */

import type { ElkNode, ElkEdge, RepositionedNode } from './drawio-layout-models';
import { setEdgePointsXml, upsertEdgeStyleKeys, replaceCellGeometryXy } from './drawio-xml-utils';

export interface XmlWriteResult {
  xml: string;
  repositionedNodes: RepositionedNode[];
}

interface Positioned { x: number; y: number; w: number; h: number; }
interface EdgeRoute { edge: ElkEdge; ownerIsRoot: boolean; }

/** Apply ELK output to the raw XML: node positions, edge waypoints, ports. */
export function applyLayoutToXml(rawXml: string, laidOut: ElkNode): XmlWriteResult {
  const rootPos = collectRootPositions(laidOut);
  const { dx, dy } = normalizeOffset(rootPos);
  const shiftedRoot = shiftBy(rootPos, dx, dy);
  const positions = collectPositions(laidOut, shiftedRoot);
  const oldPos = readCurrentPositions(rawXml);

  let xml = rawXml;
  for (const [id, p] of positions) xml = replaceCellGeometryXy(xml, id, p.x, p.y);
  for (const route of collectEdgeRoutes(laidOut)) xml = writeEdgeRoute(xml, route, positions, dx, dy);
  return { xml, repositionedNodes: buildRepositioned(oldPos, positions) };
}

/** Root-level positions only (children keep parent-relative coordinates). */
function collectRootPositions(laidOut: ElkNode): Map<string, Positioned> {
  const map = new Map<string, Positioned>();
  for (const node of laidOut.children ?? []) {
    if (node.x !== undefined && node.y !== undefined) {
      map.set(node.id, { x: node.x, y: node.y, w: node.width, h: node.height });
    }
  }
  return map;
}

/** All nodes: root-level shifted, nested untouched (already parent-relative). */
function collectPositions(laidOut: ElkNode, shiftedRoot: Map<string, Positioned>): Map<string, Positioned> {
  const map = new Map<string, Positioned>();
  for (const node of flattenAll(laidOut)) {
    if (node.id === 'root' || node.x === undefined || node.y === undefined) continue;
    const base = shiftedRoot.get(node.id) ?? { x: node.x, y: node.y };
    map.set(node.id, { x: base.x, y: base.y, w: node.width, h: node.height });
  }
  return map;
}

/** All ELK edges with the coordinate space they live in (root vs container). */
function collectEdgeRoutes(laidOut: ElkNode): EdgeRoute[] {
  const routes: EdgeRoute[] = [];
  for (const edge of laidOut.edges ?? []) routes.push({ edge, ownerIsRoot: true });
  for (const node of flattenAll(laidOut)) {
    for (const edge of node.edges ?? []) routes.push({ edge, ownerIsRoot: false });
  }
  return routes;
}

/**
 * Write one edge route: bend points (clearing stale ones) plus fixed
 * exit/entry anchors derived from ELK section endpoints, so draw.io honors
 * the routed ports and first/last segments stop cutting through shapes.
 */
function writeEdgeRoute(xml: string, route: EdgeRoute, pos: Map<string, Positioned>, dx: number, dy: number): string {
  const section = route.edge.sections?.[0];
  if (!section) return xml;
  const shift = route.ownerIsRoot ? { x: dx, y: dy } : { x: 0, y: 0 };
  const bends = (section.bendPoints ?? []).map(b => ({ x: b.x + shift.x, y: b.y + shift.y }));
  let out = setEdgePointsXml(xml, route.edge.id, bends);
  if (bends.length > 0 && section.startPoint && section.endPoint) {
    out = writeAnchors(out, route.edge, section, pos, shift);
  }
  return out;
}

/** Convert absolute section endpoints to exitX/exitY and entryX/entryY fractions. */
function writeAnchors(
  xml: string, edge: ElkEdge,
  section: NonNullable<ElkEdge['sections']>[number],
  pos: Map<string, Positioned>, shift: { x: number; y: number },
): string {
  const src = pos.get(edge.sources[0]);
  const tgt = pos.get(edge.targets[0]);
  if (!src || !tgt || !section.startPoint || !section.endPoint) return xml;
  const start = { x: section.startPoint.x + shift.x, y: section.startPoint.y + shift.y };
  const end = { x: section.endPoint.x + shift.x, y: section.endPoint.y + shift.y };
  const keys: Record<string, string | number> = {};
  if (src.w > 0 && src.h > 0) {
    keys.exitX = clamp((start.x - src.x) / src.w);
    keys.exitY = clamp((start.y - src.y) / src.h);
  }
  if (tgt.w > 0 && tgt.h > 0) {
    keys.entryX = clamp((end.x - tgt.x) / tgt.w);
    keys.entryY = clamp((end.y - tgt.y) / tgt.h);
  }
  return upsertEdgeStyleKeys(xml, edge.id, keys);
}

function clamp(v: number): number { return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100; }

function normalizeOffset(pos: Map<string, Positioned>): { dx: number; dy: number } {
  let minX = 0, minY = 0;
  for (const p of pos.values()) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
  return { dx: minX < 0 ? -minX : 0, dy: minY < 0 ? -minY : 0 };
}

function shiftBy(pos: Map<string, Positioned>, dx: number, dy: number): Map<string, Positioned> {
  const out = new Map<string, Positioned>();
  for (const [id, p] of pos) out.set(id, { ...p, x: p.x + dx, y: p.y + dy });
  return out;
}

function readCurrentPositions(xml: string): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  const cellRegex = /<mxCell\s([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(xml)) !== null) {
    const id = /id="([^"]+)"/.exec(m[1])?.[1];
    const geom = /<mxGeometry\s([^>]*?)(?:\/>|>)/.exec(m[2] ?? '');
    if (!id || !geom) continue;
    const x = parseFloat(/x="([^"]+)"/.exec(geom[1])?.[1] ?? '0');
    const y = parseFloat(/y="([^"]+)"/.exec(geom[1])?.[1] ?? '0');
    map.set(id, { x, y });
  }
  return map;
}

function buildRepositioned(
  oldPos: Map<string, { x: number; y: number }>,
  newPos: Map<string, Positioned>,
): RepositionedNode[] {
  const out: RepositionedNode[] = [];
  for (const [id, p] of newPos) {
    const o = oldPos.get(id);
    if (!o) continue;
    if (Math.abs(o.x - p.x) > 0.5 || Math.abs(o.y - p.y) > 0.5) {
      out.push({ id, x_old: o.x, y_old: o.y, x_new: p.x, y_new: p.y });
    }
  }
  return out;
}

/** Root itself + all descendants (unlike elk-layout.flatten which skips root). */
function flattenAll(root: ElkNode): ElkNode[] {
  const out: ElkNode[] = [root];
  const stack = [...(root.children ?? [])];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    if (node.children) stack.push(...node.children);
  }
  return out;
}
