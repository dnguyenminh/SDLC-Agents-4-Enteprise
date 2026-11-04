/**
 * SA4E-84 — drawio_auto_layout tool handler (FIX mode).
 * Pipeline: detect issues → fix with the minimal strategy (local repair first,
 * ELK relayout when damage is wide-spread) → re-detect to verify the result.
 * Low-severity issues (diagonal edges) are reported as warnings, never fixed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseDrawio } from './drawio-parser.js';
import type { DiagramGraph } from './drawio-parser.js';
import { handleApply } from './drawio-apply.js';
import { detectAllIssues } from './drawio-detect.js';
import type { LayoutIssue } from './drawio-detect.js';

// Backwards-compatible re-export (tests and callers import from here)
export { detectAllIssues } from './drawio-detect.js';
export type { LayoutIssue } from './drawio-detect.js';

export const DRAWIO_TOOL_DEFINITION = {
  name: 'drawio_auto_layout',
  description: 'Analyze and auto-fix draw.io diagram layout (overlaps, crossings, gaps). Fixes minimally by default; set relayout=true for a full ELK relayout or scope="ports" to only spread edge anchors.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to .drawio file (relative to workspace or absolute)' },
      algorithm: { type: 'string', enum: ['layered', 'force', 'mrtree', 'radial'], description: 'Layout algorithm (default: layered)' },
      spacing: { type: 'number', description: 'Node spacing in pixels (default: 80)' },
      direction: { type: 'string', enum: ['DOWN', 'RIGHT', 'LEFT', 'UP'], description: 'Layout direction (default: DOWN)' },
      scope: { type: 'string', enum: ['auto', 'positions', 'ports'], description: 'auto = minimal fix (default), positions = full relayout, ports = spread edge anchors only' },
      relayout: { type: 'boolean', description: 'Force full ELK relayout instead of minimal repair (default: false)' },
    },
    required: ['file_path'],
  },
};

/** Blocking = severity high|medium. Low (diagonal) is warn-only. */
function isBlocking(issue: LayoutIssue): boolean {
  return issue.severity === 'high' || issue.severity === 'medium';
}

/**
 * Entry point: detect → fix → verify.
 * @param args - Tool arguments (file_path, algorithm, spacing, direction, scope, relayout)
 * @param workspace - Workspace root path for resolving relative file_path
 * @returns JSON string: status (already_good|fixed|partially_fixed), message,
 *          remaining_issues (count after fix), warnings (low-severity hints)
 */
export async function handleDrawioLayout(args: Record<string, unknown>, workspace: string): Promise<string> {
  const filePath = resolveFilePath(args.file_path, workspace);
  if (!filePath) return pathError(args.file_path, workspace);
  if (!fs.existsSync(filePath)) return error('File not found or not accessible');
  try {
    const { raw, graph } = parseDrawio(filePath);
    const nodeCount = graph.nodes.length + graph.containers.length;
    if (nodeCount === 0) return error('No nodes found in diagram');
    const issues = detectAllIssues(graph);
    const blocking = issues.filter(isBlocking);
    const warnings = issues.filter(i => !isBlocking(i));
    if (blocking.length === 0) return alreadyGood(warnings);
    return await fixAndVerify(raw, graph, blocking, nodeCount, args, filePath, warnings.length);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return error(`Analysis failed: ${msg}`);
  }
}

/** Apply the fix, then re-parse the written file and re-detect to verify. */
async function fixAndVerify(
  raw: string, graph: DiagramGraph, blocking: LayoutIssue[],
  nodeCount: number, args: Record<string, unknown>, filePath: string, warningCount: number,
): Promise<string> {
  const applied = await handleApply(raw, graph, blocking, nodeCount, args, filePath);
  const parsed = JSON.parse(applied) as Record<string, unknown>;
  if (parsed.error) return applied; // propagate engine errors unchanged
  const after = parseDrawio(filePath);
  const remaining = detectAllIssues(after.graph).filter(isBlocking);
  parsed.remaining_issues = remaining.length;
  if (remaining.length > 0) {
    parsed.status = 'partially_fixed';
    parsed.remaining_sample = remaining.slice(0, 5).map(i => i.fix_hint ?? i.type);
  }
  if (warningCount > 0) parsed.warnings = `${warningCount} cosmetic issue(s) (diagonal edges) left as-is`;
  return JSON.stringify(parsed);
}

/**
 * Resolve file_path: canonicalize and verify within workspace boundary.
 * Prevents path traversal attacks (SEC-01: CWE-22).
 * @returns Canonical path within workspace, or null if invalid/escaping
 */
export function resolveFilePath(filePath: unknown, workspace: string): string | null {
  if (typeof filePath !== 'string' || filePath.trim() === '') return null;
  const trimmed = filePath.trim();
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(workspace, trimmed);
  const canonical = path.resolve(resolved);
  const normalizedWorkspace = path.resolve(workspace);
  const sep = path.sep;
  // SA4E-356 (SEC-04, AD-18): win32 case-fold on BOTH sides — same rule as
  // extension PathResolver.isPathWithinRoot. Fixes false-rejects when caller
  // casing (`C:`) differs from config workspace (`c:`).
  const fold = (p: string): string => process.platform === 'win32' ? p.toLowerCase() : p;
  const isWithin = fold(canonical).startsWith(fold(normalizedWorkspace + sep)) || fold(canonical) === fold(normalizedWorkspace);
  if (!isWithin) return null;
  return canonical;
}

/** SA4E-356 (BR-12): disambiguate "param missing" from "path rejected". */
function pathError(filePath: unknown, workspace: string): string {
  if (typeof filePath !== 'string' || (filePath as string).trim() === '') {
    return error('file_path is required');
  }
  const sanitized = String(filePath).replace(/[\r\n\0]/g, '?');
  // SA4E-356 (SEC-05/AD-19, SA-02): echo sanitized so the resolved path cannot
  // carry log-forging chars (TDD §10.1).
  const resolved = path.resolve(workspace, sanitized);
  return error(
    `Path rejected: ${sanitized} resolves to ${resolved} — outside backend ` +
    `workspace ${workspace}. Hint: use a path inside the backend workspace, or ` +
    `route file-content tools through the extension proxy.`
  );
}

function alreadyGood(warnings: LayoutIssue[]): string {
  const base: Record<string, unknown> = {
    status: 'already_good',
    message: 'Diagram looks good — no overlapping nodes, crossings or tight gaps detected.',
  };
  if (warnings.length > 0) {
    base.warnings = warnings.slice(0, 3).map(w => w.fix_hint ?? w.type);
  }
  return JSON.stringify(base);
}

function error(msg: string): string {
  return JSON.stringify({ error: msg });
}
