/**
 * SA4E-84 — draw.io layout issue detectors (extracted from drawio-tool.ts for
 * the SA4E-223 line-count gate; SA4E-394 keeps the file under 200 lines when
 * base_dir support is added). Detects node overlaps, edge crossings, and
 * diagonal edges. Re-exported from drawio-tool.ts for backward compatibility.
 */

import { DiagramGraph, DiagramNode } from './drawio-parser.js';

export function detectAllIssues(graph: DiagramGraph): object[] {
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
      if (overlapRatio(nodes[i], nodes[j]) > 0.50) {
        issues.push({
          type: 'node_overlap', severity: 'high',
          node_a: nodes[i].id, node_b: nodes[j].id,
          fix_hint: `Move '${nodes[j].id}' away from '${nodes[i].id}'.`,
        });
      }
    }
  }
  return issues;
}

function detectEdgeCrossings(graph: DiagramGraph): object[] {
  const issues: object[] = [];
  const nodeMap = new Map(
    [...graph.nodes, ...graph.containers].map(n => [n.id, n]),
  );
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
          edge_id: edge.id, edge_source: edge.sourceId,
          edge_target: edge.targetId, crosses_node: node.id,
          fix_hint: `Edge '${edge.id}' (${edge.sourceId}→${edge.targetId}) crosses '${node.id}'.`,
        });
        break; // One crossing per edge is enough
      }
    }
  }
  return issues;
}

function detectDiagonalEdges(graph: DiagramGraph): object[] {
  const issues: object[] = [];
  const nodeMap = new Map(
    [...graph.nodes, ...graph.containers].map(n => [n.id, n]),
  );
  const tolerance = 20; // px threshold for "diagonal"
  for (const edge of graph.edges) {
    const src = nodeMap.get(edge.sourceId);
    const tgt = nodeMap.get(edge.targetId);
    if (!src || !tgt) continue;
    const dx = Math.abs((src.x + src.width / 2) - (tgt.x + tgt.width / 2));
    const dy = Math.abs((src.y + src.height / 2) - (tgt.y + tgt.height / 2));
    if (dx > tolerance && dy > tolerance) {
      issues.push({
        type: 'diagonal_edge', severity: 'low',
        edge_id: edge.id, edge_source: edge.sourceId,
        edge_target: edge.targetId,
        fix_hint: `Edge '${edge.id}' is diagonal — ELK will align.`,
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

function lineCrossesRect(
  x1: number, y1: number, x2: number, y2: number, node: DiagramNode,
): boolean {
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

function outCode(
  x: number, y: number, l: number, t: number, r: number, b: number,
): number {
  let c = 0;
  if (x < l) c |= 1; if (x > r) c |= 2;
  if (y < t) c |= 4; if (y > b) c |= 8;
  return c;
}
