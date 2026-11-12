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

import { runDetection } from '../../slash';
import { registerLocalTool } from '../../backend-local-tools/registry';
import { prepareDesignGateRunEnv } from './design-gate-env';

import {
  parseRunArgs,
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
    // 1. Per-call env: live workspace root + WASM from the extension path
    //    (BUG-SA4E-393: no bare `vscode` global — see design-gate-env.ts).
    const env = prepareDesignGateRunEnv();
    if (!env.ok) return toolError(env.message);
    workspaceRoot = env.root;
    // 2. Parse & validate args, then resolve source_root (C3: PathResolver)
    const { mode, sourcePath, threshold, findingsLimit } = parseRunArgs(args);
    const resolution = resolveSourceRoot(sourcePath, workspaceRoot);
    if (!resolution.ok) return toolError(resolution.message);
    // 3. Run detection pipeline (loadDetector idempotent inside runDetection)
    const result = await runDetection({ detectionMode: mode, sourceRoot: resolution.sourceRoot, threshold, cacheReuse: true });
    // 4. Map report → payload (fetchStatus only for mode=rendered)
    return toolText(mapReportToPayload(result.report, mode, findingsLimit, extractFetchStatus(mode, result)));
  } catch (e: any) {
    console.error(`[design-gate] run failed: ${e?.message ?? e}`, e?.stack);
    return toolError(sanitizeErrorText(e, workspaceRoot));
  }
}

/** fetchStatus is surfaced only for mode=rendered (aggregate modes drop it per TDD). */
type FetchStatus = 'success' | 'skipped' | 'failed';
function extractFetchStatus(mode: string, result: { combinedResult?: unknown }): FetchStatus | undefined {
  const combined = result.combinedResult;
  if (mode !== 'rendered' || !combined || typeof combined !== 'object') return undefined;
  return 'fetchStatus' in combined ? (combined as { fetchStatus?: FetchStatus }).fetchStatus : undefined;
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