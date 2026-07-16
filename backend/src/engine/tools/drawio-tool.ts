/**
 * drawio_auto_layout MCP tool — REVIEW mode: detect issues, report for AI to fix.
 * Accepts content_base64 (drawio XML). Does NOT modify the file. Returns issue list.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDrawio, DiagramGraph, DiagramNode } from './drawio-parser.js';

export const DRAWIO_TOOL_DEFINITION = {
  name: 'drawio_auto_layout',
  description: 'Analyze draw.io diagram layout from base64 XML content. Detects overlaps, crossings, diagonal edges.',
  inputSchema: {
    type: 'object',
    properties: {
      content_base64: { type: 'string', description: 'Base64-encoded .drawio XML content' },
      file_path: { type: 'string', description: 'Original file path (reference only)' },
      algorithm: { type: 'string', description: 'Layout algorithm: layered|force|mrtree|radial (default: layered)' },
      spacing: { type: 'number', description: 'Node spacing in pixels (default: 80)' },
      direction: { type: 'string', description: 'Layout direction: DOWN|RIGHT|LEFT|UP (default: DOWN)' },
    },
    required: ['content_base64'],
  },
};

export function handleDrawioLayout(args: Record<string, unknown>, workspace: string): string {
  const b64 = args.content_base64 as string | undefined;
  if (!b64) return error('content_base64 is required');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-layout-'));
  const tmpFile = path.join(tmpDir, 'input.drawio');
  try {
    const content = Buffer.from(b64, 'base64').toString('utf-8');
    fs.writeFileSync(tmpFile, content, 'utf-8');
    const { graph } = parseDrawio(tmpFile);
    const nodeCount = graph.nodes.length + graph.containers.length;
    if (nodeCount === 0) return error('No nodes found in diagram');

    const issues = detectAllIssues(graph);
    if (issues.length === 0) {
      return JSON.stringify({
        status: 'already_good',
        message: 'Diagram looks good — no overlapping nodes or edge crossings detected.',
        nodes: nodeCount, edges: graph.edges.length, issues: [],
      });
    }
    return JSON.stringify({
      status: 'needs_fix',
      message: `Found ${issues.length} issues. Fix the drawio XML and call this tool again to verify.`,
      nodes: nodeCount, edges: graph.edges.length, issues,
    });
  } catch (e: any) {
    return error(`Analysis failed: ${e.message ?? e}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

function detectAllIssues(graph: DiagramGraph): object[] {
  return [
    ...detectNodeOverlaps(graph),
    ...detectEdgeCrossings(graph),
    ...detectDiagonalEdges(graph),
  ];
}

function detectNodeOverlaps(graph: DiagramGraph): object[] {
  const issues: object[] = [];
  const nodes = graph.nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].parentId !== nodes[j].parentId) continue;
      const overlap = overlapRatio(nodes[i], nodes[j]);
      if (overlap > 0.50) {
        issues.push({
          type: 'node_overlap', severity: 'high',
          node_a: nodes[i].id, node_b: nodes[j].id,
          overlap_pct: Math.round(overlap * 100),
          fix_hint: `Move '${nodes[j].id}' away from '${nodes[i].id}'.`,
        });
      }
    }
  }
  return issues;
}

function detectEdgeCrossings(graph: DiagramGraph): object[] {
  const issues: object[] = [];
  const allNodes = [...graph.nodes, ...graph.containers];
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  for (const edge of graph.edges) {
    const src = nodeMap.get(edge.sourceId);
    const tgt = nodeMap.get(edge.targetId);
    if (!src || !tgt) continue;
    const sx = src.x + src.width / 2, sy = src.y + src.height / 2;
    const tx = tgt.x + tgt.width / 2, ty = tgt.y + tgt.height / 2;
    for (const node of graph.nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      if (lineCrossesRect(sx, sy, tx, ty, node)) {
        issues.push({
          type: 'edge_crossing', severity: 'medium',
          edge_id: edge.id, edge_source: edge.sourceId, edge_target: edge.targetId,
          crosses_node: node.id,
          fix_hint: `Edge '${edge.id}' (${edge.sourceId}→${edge.targetId}) crosses '${node.id}'. Rearrange nodes.`,
        });
        break;
      }
    }
  }
  return issues;
}

function detectDiagonalEdges(graph: DiagramGraph): object[] {
  const issues: object[] = [];
  const nodeMap = new Map([...graph.nodes, ...graph.containers].map(n => [n.id, n]));
  const tolerance = 20;
  for (const edge of graph.edges) {
    const src = nodeMap.get(edge.sourceId);
    const tgt = nodeMap.get(edge.targetId);
    if (!src || !tgt) continue;
    const dx = Math.abs((src.x + src.width / 2) - (tgt.x + tgt.width / 2));
    const dy = Math.abs((src.y + src.height / 2) - (tgt.y + tgt.height / 2));
    if (dx > tolerance && dy > tolerance) {
      const fix = dx < dy
        ? `Align horizontally: set '${edge.targetId}' x=${Math.round(src.x)} (same column)`
        : `Align vertically: set '${edge.targetId}' y=${Math.round(src.y)} (same row)`;
      issues.push({
        type: 'diagonal_edge', severity: 'low',
        edge_id: edge.id, edge_source: edge.sourceId, edge_target: edge.targetId,
        fix_hint: fix,
      });
    }
  }
  return issues;
}

function overlapRatio(a: DiagramNode, b: DiagramNode): number {
  const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const area = ox * oy;
  if (area <= 0) return 0;
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? area / smaller : 0;
}

function lineCrossesRect(x1: number, y1: number, x2: number, y2: number, node: DiagramNode): boolean {
  const m = 5;
  const l = node.x - m, r = node.x + node.width + m;
  const t = node.y - m, b = node.y + node.height + m;
  if (Math.max(x1, x2) < l || Math.min(x1, x2) > r) return false;
  if (Math.max(y1, y2) < t || Math.min(y1, y2) > b) return false;
  const c1 = outCode(x1, y1, l, t, r, b);
  const c2 = outCode(x2, y2, l, t, r, b);
  if (c1 & c2) return false;
  if (c1 === 0 || c2 === 0) return false;
  return true;
}

function outCode(x: number, y: number, l: number, t: number, r: number, b: number): number {
  let c = 0;
  if (x < l) c |= 1; if (x > r) c |= 2;
  if (y < t) c |= 4; if (y > b) c |= 8;
  return c;
}

function error(msg: string): string {
  return JSON.stringify({ error: msg });
}
