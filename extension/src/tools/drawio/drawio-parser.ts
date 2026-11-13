/**
 * Parses draw.io XML into graph nodes and edges for layout processing.
 * Uses regex-based parsing (no external XML deps needed for draw.io format).
 */

import * as fs from 'fs';
import {
  parseAttrs, parseGeometry, parseLabelPosition, parseStyleAnchor, parseTerminalPoint, parseWaypoints,
} from './drawio-parser-attrs';

export interface DiagramNode {
  id: string;
  parentId: string;
  /** Raw `value` attribute (label text, may contain entities/HTML). */
  label?: string;
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
  /** Raw `value` attribute (edge label, may contain entities/HTML); '' when unlabeled. */
  label?: string;
  /** Label position along the edge (-1 source … 0 middle … 1 target). */
  labelPos?: number;
  /** Child edgeLabel cell carrying the label geometry, when draw.io stored it there. */
  labelCellId?: string;
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
  return { raw, graph: parseDrawioXml(raw) };
}

/** Parse draw.io XML text (no file I/O) — used to re-read geometry after a relayout. */
export function parseDrawioXml(xml: string): DiagramGraph {
  return extractGraph(xml);
}

interface RawCell { attrs: Record<string, string>; body: string; }

/**
 * SA4E-406 (H1): non-backtracking cell scan. The old lazy regex
 * `<mxCell\s([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)` rescans the remaining
 * input from EVERY position once a file carries an unterminated <mxCell
 * (2 MB ≈ 77 s). Literal open-tag anchors + indexOf keep the scan O(n) while
 * preserving the old tolerance (first '>' ends the open tag; an unterminated
 * cell is skipped, later cells still parse).
 */
function scanCells(xml: string): RawCell[] {
  const cells: RawCell[] = [];
  const openTag = /<mxCell\s/g;
  let m: RegExpExecArray | null;
  while ((m = openTag.exec(xml)) !== null) {
    const attrsStart = m.index + m[0].length;
    const tagEnd = xml.indexOf('>', attrsStart);
    if (tagEnd < 0) break; // unterminated open tag — nothing else can match
    const selfClosing = xml[tagEnd - 1] === '/';
    const attrsEnd = selfClosing ? tagEnd - 1 : tagEnd;
    if (selfClosing) {
      cells.push({ attrs: parseAttrs(xml.slice(attrsStart, attrsEnd)), body: '' });
      continue;
    }
    const close = xml.indexOf('</mxCell>', tagEnd + 1);
    if (close < 0) { openTag.lastIndex = tagEnd + 1; continue; } // skip, keep scanning
    cells.push({ attrs: parseAttrs(xml.slice(attrsStart, attrsEnd)), body: xml.slice(tagEnd + 1, close) });
    openTag.lastIndex = close; // resume after the close tag, like the old regex
  }
  return cells;
}

function extractGraph(xml: string): DiagramGraph {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const containers: DiagramNode[] = [];
  const looseEdges: DiagramEdge[] = [];

  const cells = scanCells(xml);

  const tableParts = tableInternals(cells);
  const edgeIds = new Set(cells.filter(c => c.attrs['edge'] === '1').map(c => c.attrs['id'] ?? ''));
  const labelCells = edgeLabelCells(cells, edgeIds);
  for (const cell of cells) {
    const id = cell.attrs['id'] ?? '';
    const style = cell.attrs['style'] ?? '';
    const parent = cell.attrs['parent'] ?? '1';

    if (cell.attrs['edge'] === '1') {
      const label = edgeLabel(cell, labelCells.get(id));
      const edge: DiagramEdge = {
        id, sourceId: cell.attrs['source'] ?? '', targetId: cell.attrs['target'] ?? '',
        style, parentId: parent, label: label.label, labelPos: label.labelPos, labelCellId: label.labelCellId,
        points: parseWaypoints(cell.body),
        exit: parseStyleAnchor(style, 'exit'),
        entry: parseStyleAnchor(style, 'entry'),
        sourcePoint: parseTerminalPoint(cell.body, 'sourcePoint'),
        targetPoint: parseTerminalPoint(cell.body, 'targetPoint'),
      };
      if (edge.sourceId && edge.targetId) edges.push(edge);
      else if (edge.sourcePoint && edge.targetPoint) looseEdges.push(edge);
    } else if (id !== '0' && id !== '1') {
      if (tableParts.has(id)) continue; // positioned by its table, not by us
      // An edge label is a child of its edge with RELATIVE geometry (x = position along the edge, y = offset):
      // it follows the edge, so it is neither a node to place nor a container child. Writing absolute
      // coordinates into it throws the label far off the page and blanks the whole export.
      if (edgeIds.has(parent) || /(?:^|;)edgeLabel(?:;|$)/.test(style)) continue;
      const geom = parseGeometry(cell.body, cell.attrs);
      if (!geom) continue;
      const isCont = !TABLE_ROOT.test(style) && (hasChildren(id, cells) || isContainerStyle(style, geom.w, geom.h));
      const node: DiagramNode = {
        id, parentId: parent, label: cell.attrs['value'] ?? '',
        x: geom.x, y: geom.y, width: geom.w, height: geom.h,
        style, isContainer: isCont,
      };
      if (isCont) containers.push(node); else nodes.push(node);
    }
  }
  return { nodes, edges, containers, looseEdges };
}

/** draw.io tables: the table, its rows and cells are laid out by childLayout=tableLayout. */
const TABLE_ROOT = /(?:^|;)(?:shape=table|childLayout=tableLayout)(?:;|$)/;
const TABLE_PART = /(?:^|;)shape=(?:tableRow|tableCell|partialRectangle)(?:;|$)/;

/**
 * Ids of rows/cells that belong to a table. Their geometry omits x/width (the table
 * computes them), so reading them as free nodes yields fake overlaps and 'outside
 * container' reports, and moving them would corrupt the table. The table itself
 * stays a single opaque node.
 */
function tableInternals(cells: Array<{ attrs: Record<string, string> }>): Set<string> {
  const byId = new Map(cells.map(c => [c.attrs['id'] ?? '', c]));
  const memo = new Map<string, boolean>();
  const inside = (id: string, depth = 0): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const cell = byId.get(id);
    const result = depth < 50 && !!cell && TABLE_PART.test(cell.attrs['style'] ?? '');
    memo.set(id, result);
    return result;
  };
  return new Set([...byId.keys()].filter(id => id !== '' && inside(id)));
}

/** A parsed mxCell: its attributes and inner markup. */
interface CellEntry { attrs: Record<string, string>; body: string; }

/**
 * The edgeLabel CHILD cell of each edge — draw.io's canonical label carrier.
 * draw.io stores the label as `<mxCell style="edgeLabel;…" value="…" parent=edgeId>`
 * with a RELATIVE geometry whose `x` is the position along the edge; the edge's
 * own value/geometry is only the legacy form (SA4E-406: the child form parsed as
 * unlabeled, so the placer and detectors never saw the label).
 */
function edgeLabelCells(cells: CellEntry[], edgeIds: Set<string>): Map<string, CellEntry> {
  const out = new Map<string, CellEntry>();
  for (const cell of cells) {
    const parent = cell.attrs['parent'] ?? '';
    if (!edgeIds.has(parent) || !/(?:^|;)edgeLabel(?:;|$)/.test(cell.attrs['style'] ?? '')) continue;
    out.set(parent, cell);
  }
  return out;
}

/** Label text + position of an edge: the edgeLabel child when present, else the edge itself. */
function edgeLabel(edge: CellEntry, child: CellEntry | undefined): { label: string; labelPos: number; labelCellId?: string } {
  if (!child) return { label: edge.attrs['value'] ?? '', labelPos: parseLabelPosition(edge.body) };
  return {
    label: child.attrs['value'] ?? edge.attrs['value'] ?? '',
    labelPos: parseLabelPosition(child.body),
    labelCellId: child.attrs['id'],
  };
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
