/**
 * SA4E-84 — drawio_auto_layout tool handler (FIX mode).
 * Analyzes draw.io layout and auto-fixes issues using ELK.js.
 * Input: file_path (reads content automatically). No mode param — always fixes.
 * Output: metadata only (no content_base64). Fixed XML written directly to file.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseDrawio, DiagramGraph, DiagramNode } from './drawio-parser.js';
import { handleApply } from './drawio-apply.js';

export const DRAWIO_TOOL_DEFINITION = {
  name: 'drawio_auto_layout',
  description: 'Analyze and auto-fix draw.io diagram layout. Detects overlaps, crossings, diagonal edges — fixes automatically with ELK layout engine if issues found.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to .drawio file (relative to workspace or absolute)' },
      algorithm: { type: 'string', enum: ['layered', 'force', 'mrtree', 'radial'], description: 'Layout algorithm (default: layered)' },
      spacing: { type: 'number', description: 'Node spacing in pixels (default: 80)' },
      direction: { type: 'string', enum: ['DOWN', 'RIGHT', 'LEFT', 'UP'], description: 'Layout direction (default: DOWN)' },
    },
    required: ['file_path'],
  },
};

/**
 * Entry point: detect issues → fix with ELK if needed → write file → return metadata.
 * @param args - Tool arguments (file_path, algorithm, spacing, direction)
 * @param workspace - Workspace root path for resolving relative file_path
 * @returns JSON string with status, message, nodes, edges, issues, repositioned_nodes
 */
export async function handleDrawioLayout(args: Record<string, unknown>, workspace: string): Promise<string> {
  const filePath = resolveFilePath(args.file_path, workspace);
  if (!filePath) {
    // SA4E-356 (BR-12): disambiguate "param missing" from "path rejected" —
    // resolve behavior itself is intentionally UNCHANGED (OI-1 follow-up).
    if (typeof args.file_path !== 'string' || (args.file_path as string).trim() === '') {
      return error('file_path is required');
    }
    const sanitized = String(args.file_path).replace(/[\r\n\0]/g, '?');
    const resolved = path.resolve(workspace, String(args.file_path));
    return error(
      `Path rejected: ${sanitized} resolves to ${resolved} — outside backend ` +
      `workspace ${workspace}. Hint: use a path inside the backend workspace, or ` +
      `route file-content tools through the extension proxy.`
    );
  }
  if (!fs.existsSync(filePath)) return error('File not found or not accessible');
  try {
    const { raw, graph } = parseDrawio(filePath);
    const nodeCount = graph.nodes.length + graph.containers.length;
    if (nodeCount === 0) return error('No nodes found in diagram');
    const issues = detectAllIssues(graph);
    // No issues → already_good, don't modify file
    if (issues.length === 0) return alreadyGood();
    // Issues found → always fix (no mode parameter)
    return handleApply(raw, graph, issues, nodeCount, args, filePath);
  } catch (e: any) {
    return error(`Analysis failed: ${e.message ?? e}`);
  }
}

/**
 * Resolve file_path: canonicalize and verify within workspace boundary.
 * Prevents path traversal attacks (SEC-01: CWE-22).
 * @param filePath - Raw file_path from tool input
 * @param workspace - Trusted workspace root
 * @returns Canonical path within workspace, or null if invalid/escaping
 */
export function resolveFilePath(filePath: unknown, workspace: string): string | null {
  if (typeof filePath !== 'string' || filePath.trim() === '') return null;
  const trimmed = filePath.trim();
  // Resolve to absolute, then canonicalize to eliminate ../ sequences
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(workspace, trimmed);
  const canonical = path.resolve(resolved);
  // Verify canonical path stays within workspace boundary
  const normalizedWorkspace = path.resolve(workspace);
  const sep = path.sep;
  // SA4E-356 (SEC-04, AD-18): win32 case-fold on BOTH sides — same rule as
  // extension/src/services/PathResolver.ts isPathWithinRoot (cross-ref).
  // Fixes false-rejects when caller casing (`C:`) differs from config
  // workspace (`c:`). Boundary semantics otherwise UNCHANGED (BR-12, OI-1).
  const fold = (p: string): string => process.platform === 'win32' ? p.toLowerCase() : p;
  const isWithin = fold(canonical).startsWith(fold(normalizedWorkspace + sep)) || fold(canonical) === fold(normalizedWorkspace);
  if (!isWithin) return null;
  return canonical;
}

function alreadyGood(): string {
  return JSON.stringify({
    status: 'already_good',
    message: 'Diagram looks good — no overlapping nodes or edge crossings detected.',
  });
}

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

export function detectEdgeCrossings(graph: DiagramGraph): object[] {
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

function error(msg: string): string {
  return JSON.stringify({ error: msg });
}
