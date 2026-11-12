/**
 * SA4E-393 — Agent-Invocable Design Gate MCP Tools (extension-side execution).
 *
 * Exposes the native 30-rule design quality gate as LOCAL_TOOL_REGISTRY entries,
 * invocable by AI agents via find_tools → execute_dynamic_tool transport
 * (same pattern as drawio_auto_layout, jira_get_issue).
 *
 * No new MCP server; tools run in the extension host, use the same runDetection
 * entry point as the three Command Palette commands.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runDetection } from '../../slash';
import { EnvConfig } from '../../slash/types';
import {
  resolveWorkspacePath,
  sanitizeLogText,
} from '../../services/PathResolver';
import { resolveWasmPath } from '../../slash/detector-env';
import { registerLocalTool } from '../../backend-local-tools/registry';

import {
  parseRunArgs,
  DEFAULT_FINDINGS_LIMIT,
} from './design-gate-args';
import {
  resolveSourceRoot,
} from './design-gate-resolve';
import {
  sanitizeErrorText,
  mapReportToPayload,
  toolText,
  toolError,
} from './design-gate-payload';
import {
  buildRuleCatalogPayload,
} from './design-gate-rules';

/** DESIGN_GATE_RUN_DEFINITION — injected into tools/list (visible, hidden unset). */
export const DESIGN_GATE_RUN_DEFINITION = {
  name: 'design_gate_run',
  description:
    'Run the design quality gate: 30 design-debt rules over design artifacts (.html .css .vue .svelte .tsx .jsx) in the workspace or a sub-path. Returns score, PASS/FAIL vs threshold, severity breakdown and findings with file:line. Agents editing design artifacts MUST call this before completing the task; fix or justify every FAIL.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['static', 'rendered', 'both'],
        description: 'Detection mode. Default: both (static files + localhost dev-server page when reachable).',
      },
      source_path: {
        type: 'string',
        description: 'Optional workspace-relative path to scan (default: workspace root). Paths resolving outside the workspace are rejected (C3).',
      },
      threshold: {
        type: 'number',
        description: 'Quality threshold 0-1. Default: DEFAULT_THRESHOLD (0.8; env QUALITY_GATE_THRESHOLD).',
      },
      findings_limit: {
        type: 'number',
        description: 'Max findings echoed in the tool output (default 200). severityBreakdown/totalIssues always cover ALL findings; full report persisted to .code-intel/design-gate/{runId}.json (BR-12).',
      },
    },
    required: [],
  },
};

/** DESIGN_GATE_LIST_RULES_DEFINITION — no input, returns rule catalog. */
export const DESIGN_GATE_LIST_RULES_DEFINITION = {
  name: 'design_gate_list_rules',
  description:
    'List the 30 design-quality rules the gate enforces (id, severity, rule text, source, applicable extensions) plus the threshold and the scoring formula. Call before creating/editing design artifacts so code passes on the first run.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

/** Handler for design_gate_run — thin orchestrator (≤20 lines). */
export async function handleDesignGateRun(args: Record<string, unknown>): Promise<unknown> {
  let workspaceRoot: string | undefined;
  try {
    // 1. Workspace root from live VS Code workspace (per-call, SA4E-356)
    workspaceRoot = process.env[EnvConfig.WORKSPACE_ROOT];
    if (!workspaceRoot) {
      return toolError('WORKSPACE_ROOT not set in wrapper server environment');
    }

    // 2. Set WORKSPACE_ROOT for pipeline (fs.adapter validates against this)
    process.env[EnvConfig.WORKSPACE_ROOT] = workspaceRoot;

    // 3. Detector env: resolve WASM path (shared helper, 3-tier)
    resolveWasmPath(workspaceRoot);

    // 4. Parse & validate args
    const { mode, sourcePath, threshold, findingsLimit } = parseRunArgs(args);

    // 5. Resolve source_root (C3: PathResolver)
    const resolution = resolveSourceRoot(sourcePath);
    if (!resolution.ok) return toolError(resolution.message);
    const sourceRoot = resolution.sourceRoot;

    // 6. Run detection pipeline (loadDetector idempotent inside runDetection)
    const result = await runDetection({
      detectionMode: mode,
      sourceRoot,
      threshold,
      cacheReuse: true,
    });

    // 7. Map report → payload (fetchStatus only for mode=rendered)
    const fetchStatus = mode === 'rendered' && 'fetchStatus' in (result.combinedResult ?? {})
      ? (result.combinedResult as any).fetchStatus
      : undefined;
    return toolText(mapReportToPayload(result.report, mode, findingsLimit, fetchStatus));
  } catch (e: any) {
    console.error(`[design-gate] run failed: ${e?.message ?? e}`, e?.stack);
    return toolError(sanitizeErrorText(e, workspaceRoot));
  }
}

/** Handler for design_gate_list_rules — no file access, no pipeline run. */
export function handleDesignGateListRules(_args: Record<string, unknown>): unknown {
  const threshold = typeof _args.threshold === 'number' ? _args.threshold : 0.8;
  return toolText(buildRuleCatalogPayload(threshold));
}

/** Registration init (mirrors mcp/atlassian/index.ts pattern). */
export function registerDesignGateLocalTools(): void {
  registerLocalTool('design_gate_run', handleDesignGateRun, DESIGN_GATE_RUN_DEFINITION);
  registerLocalTool('design_gate_list_rules', handleDesignGateListRules, DESIGN_GATE_LIST_RULES_DEFINITION);
}