/**
 * Parses draw.io XML into graph nodes and edges for layout processing.
 * Uses regex-based parsing (no external XML deps needed for draw.io format).
 */

import * as fs from 'fs';

export interface DiagramNode {
  id: string;
  parentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: string;
  isContainer: boolean;
}

export interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  style: string;
  /** Parent cell id — waypoints are stored relative to this cell's origin. */
  parentId: string;
  /** Stored waypoints (relative to edge parent origin), in file order. */
  points: Array<{ x: number; y: number }>;
  /** Fixed exit anchor as fractions of the source rect (exitX/exitY), or null. */
  exit: { x: number; y: number } | null;
  /** Fixed entry anchor as fractions of the target rect (entryX/entryY), or null. */
  entry: { x: number; y: number } | null;
  /** Stored terminal hint (as="sourcePoint"), relative to edge parent — or null. */
  sourcePoint: { x: number; y: number } | null;
  /** Stored terminal hint (as="targetPoint"), relative to edge parent — or null. */
  targetPoint: { x: number; y: number } | null;
}

export interface DiagramGraph {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  containers: DiagramNode[];
  /** Edges without source/target cells — rendered from stored terminal points. */
  looseEdges?: DiagramEdge[];
}

/** Parse .drawio XML file into DiagramGraph. */
export function parseDrawio(filePath: string): { raw: string; graph: DiagramGraph } {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const graph = extractGraph(raw);
  return { raw, graph };
}

function extractGraph(xml: string): DiagramGraph {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const containers: DiagramNode[] = [];
  const looseEdges: DiagramEdge[] = [];

  // Match all mxCell elements (self-closing or with children).
  // SA4E-410 (DISC-6): the open-tag attribute segment must be quote-aware —
  // `[^>]*?` stops at the first `>` including ones inside a quoted attribute
  // value (e.g. value="Map<string, Tab>"), truncating the tag so style/parent
  // attributes AFTER the value are dropped and the mis-parsed cell drifts to
  // the wrong parent in layout.
  const cellRegex = /<mxCell\s((?:"[^"]*"|'[^']*'|[^"'>])*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  const cells: Array<{ attrs: Record<string, string>; body: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = cellRegex.exec(xml)) !== null) {
    const attrs = parseAttrs(match[1]);
    const body = match[2] ?? '';
    cells.push({ attrs, body });
  }

  for (const cell of cells) {
    const id = cell.attrs['id'] ?? '';
    const style = cell.attrs['style'] ?? '';
    const parent = cell.attrs['parent'] ?? '1';

    if (cell.attrs['edge'] === '1') {
      const edge: DiagramEdge = {
        id, sourceId: cell.attrs['source'] ?? '', targetId: cell.attrs['target'] ?? '',
        style, parentId: parent,
        points: parseWaypoints(cell.body),
        exit: parseStyleAnchor(style, 'exit'),
        entry: parseStyleAnchor(style, 'entry'),
        sourcePoint: parseTerminalPoint(cell.body, 'sourcePoint'),
        targetPoint: parseTerminalPoint(cell.body, 'targetPoint'),
      };
      if (edge.sourceId && edge.targetId) edges.push(edge);
      else if (edge.sourcePoint && edge.targetPoint) looseEdges.push(edge);
    } else if (id !== '0' && id !== '1') {
      const geom = parseGeometry(cell.body, cell.attrs);
      if (!geom) continue;
      const isCont = hasChildren(id, cells) || isContainerStyle(style, geom.w, geom.h);
      const node: DiagramNode = {
        id, parentId: parent,
        x: geom.x, y: geom.y, width: geom.w, height: geom.h,
        style, isContainer: isCont,
      };
      if (isCont) containers.push(node); else nodes.push(node);
    }
  }
  return { nodes, edges, containers, looseEdges };
}

function parseGeometry(body: string, _cellAttrs: Record<string, string>): { x: number; y: number; w: number; h: number } | null {
  // Look for mxGeometry in body or as sibling in raw XML (quote-aware attr
  // segment — see DISC-6 note in extractGraph).
  const geomRegex = /<mxGeometry\s((?:"[^"]*"|'[^']*'|[^"'>])*?)(?:\/>|>)/;
  const geomMatch = body.match(geomRegex);
  if (!geomMatch) return null;
  const attrs = parseAttrs(geomMatch[1]);
  if (attrs['as'] !== 'geometry') return null;
  return {
    x: parseFloat(attrs['x'] ?? '0'),
    y: parseFloat(attrs['y'] ?? '0'),
    w: parseFloat(attrs['width'] ?? '80'),
    h: parseFloat(attrs['height'] ?? '40'),
  };
}

function parseAttrs(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(attrStr)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

/** Extract stored waypoints from an edge's <Array as="points"> section. */
function parseWaypoints(body: string): Array<{ x: number; y: number }> {
  const arr = /<Array\s+as="points">([\s\S]*?)<\/Array>/.exec(body);
  if (!arr) return [];
  const points: Array<{ x: number; y: number }> = [];
  const pointRegex = /<mxPoint\s((?:"[^"]*"|'[^']*'|[^"'>])*?)(?:\/>|>)/g;
  let m: RegExpExecArray | null;
  while ((m = pointRegex.exec(arr[1])) !== null) {
    const attrs = parseAttrs(m[1]);
    points.push({ x: parseFloat(attrs['x'] ?? '0'), y: parseFloat(attrs['y'] ?? '0') });
  }
  return points;
}

/** Parse exit/entry anchor fractions (exitX/exitY, entryX/entryY) from edge style. */
function parseStyleAnchor(style: string, kind: 'exit' | 'entry'): { x: number; y: number } | null {
  const x = new RegExp(`${kind}X=([^;]*)`).exec(style)?.[1];
  const y = new RegExp(`${kind}Y=([^;]*)`).exec(style)?.[1];
  if (x === undefined && y === undefined) return null;
  return { x: parseFloat(x ?? '0.5'), y: parseFloat(y ?? '0.5') };
}

/** Extract a stored terminal hint point (as="sourcePoint"|"targetPoint"). */
function parseTerminalPoint(body: string, kind: 'sourcePoint' | 'targetPoint'): { x: number; y: number } | null {
  const tagRe = /<mxPoint\s((?:"[^"]*"|'[^']*'|[^"'>])*?)(?:\/>|>)/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) !== null) {
    if (!m[1].includes(`as="${kind}"`)) continue;
    const attrs = parseAttrs(m[1]);
    return { x: parseFloat(attrs['x'] ?? '0'), y: parseFloat(attrs['y'] ?? '0') };
  }
  return null;
}

function hasChildren(nodeId: string, cells: Array<{ attrs: Record<string, string>; body: string }>): boolean {
  return cells.some(c =>
    c.attrs['parent'] === nodeId && c.attrs['edge'] !== '1' && c.body.includes('mxGeometry')
  );
}

function isContainerStyle(style: string, width: number, height: number): boolean {
  const s = style.toLowerCase();
  if (s.includes('swimlane')) return true;
  if (s.includes('fillcolor=none') && s.includes('dashed=1')) return true;
  if (s.includes('shape=rectangle') && s.includes('dashed=1') && width > 300 && height > 300) return true;
  return false;
}
