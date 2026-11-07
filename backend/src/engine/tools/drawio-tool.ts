/**
 * SA4E-84 — drawio_auto_layout tool handler (FIX mode).
 * Analyzes draw.io layout and auto-fixes issues using ELK.js.
 * Input: file_path (reads content automatically). No mode param — always fixes.
 * Output: metadata only (no content_base64). Fixed XML written directly to file.
 * SA4E-394 — per-call base_dir support: when base_dir/workspace_root is
 * present the path is resolved via the shared multi-worktree resolver; the
 * legacy branch keeps byte-for-byte behavior (C-3).
 */

import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { parseDrawio } from './drawio-parser.js';
import { handleApply } from './drawio-apply.js';
import { detectAllIssues } from './drawio-detection.js';
import {
  hasBaseDirArg,
  type MultiWorktreePathResolver,
} from '../../shared/multi-worktree-path-resolver.js';
import { getSharedPathResolver } from '../../shared/path-resolver-provider.js';
import { baseDirSchemaProperties } from '../../shared/base-dir-schema.js';

export { detectAllIssues } from './drawio-detection.js';

const logger = pino({ name: 'drawio-tool' });

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
      ...baseDirSchemaProperties('file_path'),
    },
    required: ['file_path'],
  },
};

/**
 * Entry point: detect issues → fix with ELK if needed → write file → return metadata.
 * @param args - Tool arguments (file_path, algorithm, spacing, direction, base_dir)
 * @param workspace - Workspace root path for resolving relative file_path
 * @param resolver - SA4E-394 optional shared multi-worktree path resolver
 * @returns JSON string with status, message, nodes, edges, issues, repositioned_nodes
 */
export async function handleDrawioLayout(args: Record<string, unknown>, workspace: string, resolver?: MultiWorktreePathResolver): Promise<string> {
  // SA4E-394: base_dir present → resolver-driven path; absent → legacy code
  // path unchanged byte-for-byte (C-3 / TC-800).
  if (hasBaseDirArg(args)) {
    const outcome = resolveWithBaseDir(args, resolver);
    return outcome.ok ? layoutOn(outcome.path, args) : outcome.text;
  }
  const filePath = resolveFilePath(args.file_path, workspace);
  if (!filePath) {
    // SA4E-356 (BR-12): disambiguate "param missing" from "path rejected" —
    // resolve behavior itself is intentionally UNCHANGED (OI-1 follow-up).
    if (typeof args.file_path !== 'string' || (args.file_path as string).trim() === '') {
      return error('file_path is required');
    }
    const sanitized = String(args.file_path).replace(/[\r\n\0]/g, '?');
    // SA4E-356 (SEC-05/AD-19, SA-02): resolve from the sanitized value so the
    // echoed `resolved` path cannot carry [\r\n\0] log-forging chars (TDD §10.1
    // — same rule as extension PathResolver.ts sanitizeLogText, cross-ref).
    const resolved = path.resolve(workspace, sanitized);
    return error(
      `Path rejected: ${sanitized} resolves to ${resolved} — outside backend ` +
      `workspace ${workspace}. Hint: use a path inside the backend workspace, or ` +
      `route file-content tools through the extension proxy.`
    );
  }
  return layoutOn(filePath, args);
}

/** SA4E-394 — resolver-driven branch outcome for the base_dir path. */
type LayoutResolution = { ok: true; path: string } | { ok: false; text: string };

function resolveWithBaseDir(args: Record<string, unknown>, resolver?: MultiWorktreePathResolver): LayoutResolution {
  const result = getSharedPathResolver(logger).resolve({
    filePath: args.file_path, baseDir: args.base_dir, workspaceRoot: args.workspace_root,
  });
  if (result.ok) return { ok: true, path: result.resolvedPath };
  if (typeof args.file_path !== 'string' || (args.file_path as string).trim() === '') {
    return { ok: false, text: error('file_path is required') };
  }
  return { ok: false, text: error(result.message) };
}

/** Parse → detect → fix (or already_good) on an already-resolved path. */
async function layoutOn(filePath: string, args: Record<string, unknown>): Promise<string> {
  if (!fs.existsSync(filePath)) return error('File not found or not accessible');
  try {
    const { raw, graph } = parseDrawio(filePath);
    const nodeCount = graph.nodes.length + graph.containers.length;
    if (nodeCount === 0) return error('No nodes found in diagram');
    const issues = detectAllIssues(graph);
    // No issues → already_good, don't modify file
    if (issues.length === 0) return alreadyGood();
    // Issues found → always fix (no mode parameter)
    return await handleApply(raw, graph, issues, nodeCount, args, filePath);
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

function error(msg: string): string {
  return JSON.stringify({ error: msg });
}
