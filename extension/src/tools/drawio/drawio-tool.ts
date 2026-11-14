/**
 * SA4E-406 — drawio_auto_layout LOCAL tool (extension-side execution).
 * Runs in the IDE process against the live workspace; engine modules are
 * ported from backend/src/engine/tools/* with byte-for-byte behavior.
 * Handler contract: LocalToolHandler (args in → MCP tool-result shape out).
 */

import * as fs from 'fs';
import { parseDrawio } from './drawio-parser';
import { handleApply } from './drawio-apply';
import { detectAllIssues } from './drawio-detection';
import { resolveWorkspacePath, sanitizeLogText, FILE_PATH_SCHEMA_DESCRIPTION } from '../../services/PathResolver';
import { extractBaseDirArg } from '../../services/base-dir-resolution';
import { preflight } from './drawio-preflight';
import { adoptVisualChildren } from './drawio-adopt-children';
import { normalizeLayoutArgs, parseThresholdArgs, resolveDetectThresholds } from './drawio-apply-args';
import type { DetectThresholds } from './drawio-detect';
import { enforceFinalGate, validateReparse } from './drawio-apply-validate';
import { atomicWriteFileSync } from './drawio-atomic-write';
import { REPORT_ONLY_ISSUE_TYPES } from './drawio-detect-structure';
import { reportOnlyOutcome } from './drawio-report-only';
import type { RootInfo } from './drawio-result';
import { baseDirSchemaProperties } from '../../services/tool-descriptions';
import type { ToolCallContext } from '../../backend-local-tools/registry';

export const DRAWIO_AUTO_LAYOUT_DEFINITION = {
  name: 'drawio_auto_layout',
  description:
    'Detect and auto-fix layout problems in ONE local .drawio file (node overlaps, bunched children, ' +
    'edge crossings, off-grid cells, misplaced edge parents). Runs locally in the ' +
    'extension and OVERWRITES the file in place (no backup, no PNG - call drawio_export_png afterwards to render). ' +
    'Strategy: minimal local repair first; falls back to a humanized layered ELK layout (or force/mrtree/radial/stress) ' +
    'when needed or when relayout=true. Sequence diagrams (lifelines, messages, alt/loop/opt fragments, ' +
    'free-floating message points) and use-case diagrams (actors, boundaries, rounded-box use cases) get dedicated ' +
    'layouts that keep their structure. Unescaped "<" or "&" in attribute values and visual children outside their ' +
    'container are repaired first; an <mxfile> wrapper is unwrapped to the bare <mxGraphModel>. ' +
    'Malformed tags are refused with an actionable message. ' +
    'Returns JSON text {status, message, remaining_issues, iteration_history, issues, repositioned_nodes, ' +
    'strategy_used, effective_root, root_source, nodes, edges}: status is "fixed" (layout changed), ' +
    '"already_good" (nothing to improve) or "partial" (improved, but issues that need a human decision remain - ' +
    'empty lane titles, branch labels, oversized bands are reported, never invented). ' +
    'Errors set isError (e.g. file not found, no nodes, PATH_REJECTED_OUTSIDE_*). ' +
    'Calling it again on its own output is idempotent. ' +
    'Pass file_path only; relative paths resolve against the first workspace folder of the Kiro window ' +
    '(or base_dir).',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description:
          'Path of the .drawio file to analyze and rewrite in place. ' + FILE_PATH_SCHEMA_DESCRIPTION,
      },
      algorithm: {
        type: 'string',
        enum: ['layered', 'force', 'mrtree', 'radial', 'stress'],
        description:
          'ELK algorithm used when a full relayout is needed (default: layered - best for flows/architecture; ' +
          'mrtree for trees, radial for hub-and-spoke, force/stress for unstructured graphs — stress scales to ' +
          'large graphs). Ignored by the sequence and use-case strategies.',
      },
      spacing: {
        type: 'number',
        description: 'Node spacing in pixels for a full relayout (default: 80). Ignored by sequence/use-case strategies.',
      },
      direction: {
        type: 'string',
        enum: ['DOWN', 'RIGHT', 'LEFT', 'UP'],
        description: 'Flow direction for a full relayout (default: DOWN). Ignored by sequence/use-case strategies.',
      },
      relayout: {
        type: 'boolean',
        description:
          'true = skip minimal repair and force a full relayout even if the diagram looks fine ' +
          '(default: false - minimal repair first, so hand-tuned positions are preserved when possible).',
      },
      gap_threshold: {
        type: 'number',
        description:
          'Minimum breathing room in px between sibling nodes before flagging proximity ' +
          '(default: 40). 0-500. Omit for the default behaviour.',
      },
      overlap_threshold: {
        type: 'number',
        description:
          'Fraction of the smaller node two cells must cover before flagging an overlap ' +
          '(default: 0.05). 0-1 (exclusive). Omit for the default behaviour.',
      },
      ...baseDirSchemaProperties('file_path'),
    },
    required: ['file_path'],
  },
};
/** Entry point: resolve path → parse → detect → fix (or already_good) → write file. */
export async function handleDrawioAutoLayout(args: Record<string, unknown>, ctx?: ToolCallContext): Promise<unknown> {
  const rawPath = args.file_path as unknown;
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    return toolError('file_path is required');
  }
  const sanitized = sanitizeLogText(rawPath);
  // Extension PathResolver = single validation point (SA4E-356 pattern) —
  // validates against the LIVE workspace folder, honors per-call base_dir.
  // F4: forward the bound session root so session-bound clients resolve
  // against their session root, not legacy folders[0].
  const resolution = resolveWorkspacePath(rawPath, { baseDir: extractBaseDirArg(args), sessionRoot: ctx?.sessionRoot });
  if (!resolution.ok) {
    console.warn(`[drawio-auto-layout] resolve failed: ${resolution.message}`);
    return toolError(resolution.message);
  }
  const filePath = resolution.resolvedPath;
  // SA4E-406 (A2): root provenance is known at resolution time — pass through.
  const root: RootInfo = { effective_root: resolution.rootPath, root_source: resolution.rootSource };
  return layoutOn(filePath, args, sanitized, root);
}

/** Parse → detect → fix (or already_good) on an already-resolved path. */
async function layoutOn(
  filePath: string, args: Record<string, unknown>, displayPath: string, root: RootInfo,
): Promise<unknown> {
  if (!fs.existsSync(filePath)) return toolError('File not found or not accessible');
  const originalBytes = fs.readFileSync(filePath);
  let thresholds: DetectThresholds;
  let scope: string;
  try {
    // A1: optional per-run detector thresholds — rejected values are tool errors.
    thresholds = resolveDetectThresholds(parseThresholdArgs(args));
    scope = normalizeLayoutArgs(args).scope;
  } catch (e: any) {
    return toolError(e.message ?? String(e));
  }
  try {
    const pre = preflight(filePath, root.root_source === 'workspace' ? root.effective_root : null, displayPath);
    if ('error' in pre) return toolError(pre.error);
    // Boxes drawn OVER an empty band belong to it: make that structural before analysing
    const adoption = adoptVisualChildren(fs.readFileSync(filePath, 'utf-8'));
    if (adoption.adopted.size > 0) {
      validateReparse(adoption.xml);
      atomicWriteFileSync(filePath, adoption.xml);
      console.warn(`[drawio-auto-layout] '${displayPath}': ${[...adoption.adopted.values()].flat().length} box(es) moved into the band that visually holds them`);
    }
    const { raw, graph } = parseDrawio(filePath);
    const nodeCount = graph.nodes.length + graph.containers.length;
    if (nodeCount === 0) {
      restoreOriginal(filePath, originalBytes);
      return toolError('No nodes found in diagram');
    }
    const issues = detectAllIssues(graph, thresholds);
    const forced = args.relayout === true;
    const blocking = issues.filter(i => i.severity !== 'low');
    if (!forced && scope === 'auto' && blocking.length === 0) {
      // Preflight/adopt may already have rewritten the file: leave it on-grid.
      enforceFinalGate(filePath);
      return toolText(JSON.stringify({
        status: 'already_good',
        message: 'Diagram looks good — no overlapping nodes or edge crossings detected.',
      }));
    }
    // Content decisions the tool cannot make: never a destructive relayout —
    // label the unambiguous branches, surface the rest (SA4E-406 g/h/a).
    if (!forced && blocking.length > 0 && blocking.every(i => REPORT_ONLY_ISSUE_TYPES.has(i.type))) {
      return toolText(reportOnlyOutcome(filePath, raw, graph, issues, root, thresholds));
    }
    // Issues found → always fix (no mode parameter)
    const resultJson = await handleApply(raw, graph, issues, nodeCount, args, filePath, root, thresholds);
    if (isErrorPayload(resultJson)) restoreOriginal(filePath, originalBytes);
    return toolText(resultJson);
  } catch (e: any) {
    restoreOriginal(filePath, originalBytes);
    console.error(`[drawio-auto-layout] analysis failed for '${displayPath}':`, e?.message ?? e);
    return toolError(`Analysis failed: ${e.message ?? e}`);
  }
}

/** Detect the strategy error payload without treating ordinary output as failure. */
function isErrorPayload(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as { error?: unknown };
    return typeof parsed.error === 'string';
  } catch {
    return false;
  }
}

/** Restore the exact pre-call bytes after a failed transactional run. */
function restoreOriginal(filePath: string, bytes: Buffer): void {
  try {
    atomicWriteFileSync(filePath, bytes);
  } catch (restoreError: unknown) {
    console.error('[drawio-auto-layout] Failed to restore original file:', restoreError);
  }
}

function toolText(text: string): unknown {
  return { content: [{ type: 'text', text }], isError: false };
}

function toolError(msg: string): unknown {
  return { content: [{ type: 'text', text: msg }], isError: true };
}
