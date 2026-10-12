/**
 * Role-aware tool loadout with schema-token cap — SA4E-355 Task 4 (UC-04).
 *
 * Wire-only composition (BR-11): role → tool-group mapping per FSD §3.4.4,
 * phase-based trim priority, and the OI-4 schema estimator. Core file tools
 * and the dynamic discovery pair are NEVER removed (BR-06); unknown roles
 * fail open (BR-07); a cap that cannot be met keeps the non-negotiable set
 * and hands the remainder to the budget gate (EF-1 UC-04).
 */
import { logger } from '../logger';
import type { ContextBudget } from './models/ContextBudget';
import { estimateToolSchemaTokens, type LoadoutTool } from './tool-schema-tokens';

/** Core file tools — never dropped from any loadout (BR-06 / FSD §3.4.4). */
export const CORE_FILE_TOOLS: readonly string[] = ['read', 'write', 'edit', 'grep', 'find', 'ls'];

/** Dynamic discovery pair — never dropped (BR-06, tool-usage-dynamic pattern). */
export const DISCOVERY_TOOLS: readonly string[] = ['find_tools', 'execute_dynamic_tool'];

/** Share of staticBudget reserved for tool schemas (FSD §3.4.4 schemaTokenCap). */
export const TOOL_SCHEMA_BUDGET_RATIO = 0.25;

/**
 * Role → allowed MCP tool-name prefixes (FSD §3.4.4). '*' = full set
 * (SM regression). Unknown/absent role keeps the whole pool (BR-07).
 */
export const ROLE_TOOL_PREFIXES: Record<string, readonly string[]> = {
  SM: ['*'],
  BA: ['docs_', 'mem_', 'jira_'],
  SA: ['docs_', 'mem_', 'jira_', 'drawio_'],
  DEV: ['git_', 'build_', 'code_', 'mem_', 'docs_'],
  DevOps: ['git_', 'build_', 'deploy_', 'pipeline_', 'code_', 'mem_', 'docs_'],
  QA: ['test_', 'qa_', 'jira_', 'mem_', 'code_', 'drawio_'],
  UI: ['docs_', 'drawio_', 'mem_', 'jira_'],
  Security: ['security_', 'mem_', 'code_', 'jira_'],
};

/** Phase → MCP prefixes preferred for that phase — trimmed last (FSD §3.4.2 step 4). */
const PHASE_PREFERRED_PREFIXES: Record<string, readonly string[]> = {
  requirements: ['jira_', 'brd_'],
  specification: ['fsd_', 'docs_', 'jira_'],
  design: ['drawio_', 'tdd_', 'docs_'],
  'test-planning': ['test_', 'qa_', 'stp_', 'stc_'],
  implementation: ['git_', 'build_', 'code_'],
  testing: ['test_', 'jira_', 'report_'],
  deployment: ['deploy_', 'pipeline_', 'release_'],
};

/** Options for {@link buildSessionToolLoadout} (FSD §3.4.6). */
export interface LoadoutOptions {
  /** Pipeline role — drives the MCP tool-group filter (BR-07 fail-open). */
  role?: string;
  /** Pipeline phase — preferred tools are trimmed last (FSD §3.4.2 step 4). */
  phase?: string;
  /** Schema-token cap for the WHOLE loadout (share of staticBudget). */
  schemaTokenCap?: number;
  /** Escalation step 3 / small tier: keep only core + discovery (BR-06). */
  minimal?: boolean;
  /** Core + shell + orientation entries — never dropped. Defaults to {@link CORE_FILE_TOOLS}. */
  coreTools?: readonly LoadoutTool[];
  /** Discovery pair — never dropped. Defaults to {@link DISCOVERY_TOOLS}. */
  discoveryTools?: readonly LoadoutTool[];
  /** MCP/extension pool subject to the role filter and cap trim. */
  mcpTools?: readonly LoadoutTool[];
}

/** Result of {@link buildSessionToolLoadout} (FSD §3.4.4). */
export interface LoadoutResult {
  /** Ordered tool-name allowlist: core → discovery → kept MCP (deduped). */
  loadout: string[];
  /** Measured schema tokens — deducted from staticBudget before gate measurement. */
  schemaTokens: number;
  /** True when the cap could not be met even at the min set (EF-1 UC-04). */
  capExceeded: boolean;
  /** True when reduced to core + discovery only (escalation step 3 / small tier). */
  minimal: boolean;
}

/** Derives the tool-schema token cap from the session budget (FSD §3.4.4). */
export function toolSchemaTokenCap(budget: ContextBudget): number {
  return Math.floor(budget.staticBudget * TOOL_SCHEMA_BUDGET_RATIO);
}

/** Wraps bare tool names as name-only loadout entries (OI-4 name estimate). */
export function nameTools(names: readonly string[]): LoadoutTool[] {
  return names.map((name) => ({ name }));
}

/**
 * Builds the role-aware, budget-capped tool loadout (UC-04).
 * Unknown role keeps the full pool (BR-07); minimal mode keeps only the
 * non-negotiable set (BR-06); over-cap trims the lowest phase-priority
 * tools first and logs PI_TOOL_SCHEMA_CAP when the cap is unreachable.
 */
export function buildSessionToolLoadout(options: LoadoutOptions = {}): LoadoutResult {
  const core = options.coreTools ?? nameTools(CORE_FILE_TOOLS);
  const discovery = options.discoveryTools ?? nameTools(DISCOVERY_TOOLS);
  const alwaysKeep = [...core, ...discovery];
  const minTokens = tokensOf(alwaysKeep);
  if (options.minimal) {
    return compose(alwaysKeep, [], minTokens, false, true); // BR-06 only
  }
  const candidates = sortForTrim(filterByRole(options.mcpTools ?? [], options.role), options.phase);
  const { kept, capExceeded } = trimToCap(candidates, minTokens, options.schemaTokenCap);
  return compose(alwaysKeep, kept, minTokens + tokensOf(kept), capExceeded, false);
}

/** Role filter: unknown role or '*' keeps everything (BR-07 / SM regression). */
function filterByRole(pool: readonly LoadoutTool[], role: string | undefined): LoadoutTool[] {
  const allowed = ROLE_TOOL_PREFIXES[(role ?? '').trim()];
  if (!allowed || allowed.includes('*')) return [...pool];
  return pool.filter((t) => allowed.some((prefix) => t.name.startsWith(prefix)));
}

/** Sorts candidates for trimming: phase-preferred first, stable on pool order. */
function sortForTrim(candidates: LoadoutTool[], phase: string | undefined): LoadoutTool[] {
  const preferred = PHASE_PREFERRED_PREFIXES[(phase ?? '').trim()] ?? [];
  return candidates
    .map((tool, index) => ({ tool, index, priority: preferred.some((p) => tool.name.startsWith(p)) ? 2 : 1 }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map((entry) => entry.tool);
}

/** Drops lowest-priority candidates (end of sorted list) until within cap. */
function trimToCap(
  candidates: LoadoutTool[],
  minTokens: number,
  cap: number | undefined
): { kept: LoadoutTool[]; capExceeded: boolean } {
  if (cap === undefined || cap < 0) return { kept: [...candidates], capExceeded: false };
  const kept = [...candidates];
  let total = minTokens + tokensOf(kept);
  while (total > cap && kept.length > 0) {
    total -= estimateToolSchemaTokens(kept.pop() as LoadoutTool); // last = lowest priority (STC-019)
  }
  const capExceeded = total > cap;
  if (capExceeded) {
    logger.warn('PI_TOOL_SCHEMA_CAP', { tokens: total, cap }); // EF-1 UC-04 — gate decides
  }
  return { kept, capExceeded };
}

/** Composes the ordered, deduped name allowlist plus the token accounting. */
function compose(
  alwaysKeep: LoadoutTool[],
  keptMcp: LoadoutTool[],
  schemaTokens: number,
  capExceeded: boolean,
  minimal: boolean
): LoadoutResult {
  const loadout = [...alwaysKeep, ...keptMcp]
    .map((t) => t.name)
    .filter((n, i, all) => typeof n === 'string' && n && all.indexOf(n) === i);
  return { loadout, schemaTokens, capExceeded, minimal };
}

/** Sum of estimated schema tokens across tools (OI-4). */
function tokensOf(tools: readonly LoadoutTool[]): number {
  return tools.reduce((sum, t) => sum + estimateToolSchemaTokens(t), 0);
}
