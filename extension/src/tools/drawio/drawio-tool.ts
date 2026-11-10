/**
 * SA4E-406 — drawio_auto_layout LOCAL tool (extension-side execution).
 *
 * Extension Migration (BRD STORY 4 / FSD 3.4): the tool implementation moves
 * from the backend server INTO the extension so it runs in the IDE process —
 * no backend dependency, path resolution against the LIVE VS Code workspace
 * (not a backend allowlist).
 *
 * Engine modules (parser/detect/apply/ELK) are ported verbatim from
 * backend/src/engine/tools/* — same behavior, byte-for-byte outputs.
 *
 * Handler contract: LocalToolHandler shape from backend-local-tools/registry
 * (args in → MCP tool-result shape out).
 */

import * as fs from 'fs';
import { parseDrawio } from './drawio-parser';
import { handleApply } from './drawio-apply';
import { detectAllIssues } from './drawio-detection';
import {
  resolveWorkspacePath,
  sanitizeLogText,
  FILE_PATH_SCHEMA_DESCRIPTION,
} from '../../services/PathResolver';
import { extractBaseDirArg } from '../../services/base-dir-resolution';
import { findMalformedTags, sanitizeDrawioXml } from './drawio-xml-sanitize';

export const DRAWIO_AUTO_LAYOUT_DEFINITION = {
  name: 'drawio_auto_layout',
  description:
    'Analyze and auto-fix draw.io diagram layout. Detects overlaps, crossings, diagonal edges — ' +
    'fixes automatically with ELK layout engine if issues found. Runs locally in the extension.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: FILE_PATH_SCHEMA_DESCRIPTION },
      algorithm: { type: 'string', enum: ['layered', 'force', 'mrtree', 'radial'], description: 'Layout algorithm (default: layered)' },
      spacing: { type: 'number', description: 'Node spacing in pixels (default: 80)' },
      direction: { type: 'string', enum: ['DOWN', 'RIGHT', 'LEFT', 'UP'], description: 'Layout direction (default: DOWN)' },
      relayout: { type: 'boolean', description: 'Force full ELK relayout (default: false — minimal repair first)' },
      base_dir: {
        type: 'string',
        description:
          'Optional workspace root to resolve relative file_path against. Relative values are ' +
          'normalized to absolute. Example: /home/user/project-worktree-B',
      },
      workspace_root: {
        type: 'string',
        description:
          'Deprecated alias of base_dir (same semantics). Ignored when base_dir is present. ' +
          'Example: /home/user/project-worktree-B',
      },
    },
    required: ['file_path'],
  },
};

/** Entry point: resolve path → parse → detect → fix (or already_good) → write file. */
export async function handleDrawioAutoLayout(args: Record<string, unknown>): Promise<unknown> {
  const rawPath = args.file_path as unknown;
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    return toolError('file_path is required');
  }
  const sanitized = sanitizeLogText(rawPath);
  // Extension PathResolver = single validation point (SA4E-356 pattern) —
  // validates against the LIVE workspace folder, honors per-call base_dir.
  const resolution = resolveWorkspacePath(rawPath, { baseDir: extractBaseDirArg(args) });
  if (!resolution.ok) {
    console.warn(`[drawio-auto-layout] resolve failed: ${resolution.message}`);
    return toolError(resolution.message);
  }
  const filePath = resolution.resolvedPath;
  return layoutOn(filePath, args, sanitized);
}

/** Parse → detect → fix (or already_good) on an already-resolved path. */
async function layoutOn(filePath: string, args: Record<string, unknown>, displayPath: string): Promise<unknown> {
  if (!fs.existsSync(filePath)) return toolError('File not found or not accessible');
  try {
    // SA4E-406 UAT: draw.io syntax pre-flight — repair unescaped '<'/'&' in
    // attribute values BEFORE layout, so we never build on (or re-write)
    // a file draw.io itself cannot open. Repair is idempotent.
    const { xml: cleaned, fixes } = sanitizeDrawioXml(fs.readFileSync(filePath, 'utf-8'));
    if (fixes.length > 0) {
      fs.writeFileSync(filePath, cleaned, 'utf-8');
      console.warn(`[drawio-auto-layout] sanitized '${displayPath}' before layout — ${fixes.join('; ')}`);
    }
    // Tags the tolerant parser would silently skip: refuse, with an actionable message
    const malformed = findMalformedTags(cleaned);
    if (malformed.length > 0) {
      const first = malformed[0];
      return toolError(
        `draw.io syntax error: ${malformed.length} malformed <${first.tag}> tag(s); first at line ${first.line}: ` +
        `"${first.sample}". Fix the quoting in this file (it cannot be repaired automatically) and run again.`,
      );
    }

    const { raw, graph } = parseDrawio(filePath);
    const nodeCount = graph.nodes.length + graph.containers.length;
    if (nodeCount === 0) return toolError('No nodes found in diagram');
    const issues = detectAllIssues(graph);
    // No blocking issues → already_good, don't modify file. Low severity is
    // cosmetic (see drawio-detect) and must not trigger a rewrite, otherwise
    // the tool is never idempotent.
    if (issues.every(i => i.severity === 'low')) {
      return toolText(JSON.stringify({
        status: 'already_good',
        message: 'Diagram looks good — no overlapping nodes or edge crossings detected.',
      }));
    }
    // Issues found → always fix (no mode parameter)
    const resultJson = await handleApply(raw, graph, issues, nodeCount, args, filePath);
    return toolText(resultJson);
  } catch (e: any) {
    console.error(`[drawio-auto-layout] analysis failed for '${displayPath}':`, e?.message ?? e);
    return toolError(`Analysis failed: ${e.message ?? e}`);
  }
}

function toolText(text: string): unknown {
  return { content: [{ type: 'text', text }], isError: false };
}

function toolError(msg: string): unknown {
  return { content: [{ type: 'text', text: msg }], isError: true };
}
