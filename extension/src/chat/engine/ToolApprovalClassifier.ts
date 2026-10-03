/**
 * SA4E-85 — ToolApprovalClassifier (Task 3).
 * Classifies tools as dangerous (requiresApproval) or safe (auto-approve).
 * Used by the execute_tools node to determine if human-in-the-loop is needed.
 *
 * SA4E-336: canonical home for PowerShell command-content security (FSD §3.3.1).
 * The destructive catalog, safe allowlist, and normalization live in
 * ps-command-patterns.ts (file-size / SRP separation) and are re-exported here
 * so consumers import them from the single classifier module. Name-based sets
 * below are UNCHANGED — no 'bash'/'powershell' name entries (TDD §3.2, BRD §1.2).
 */
export {
  DESTRUCTIVE_PS_PATTERNS,
  READONLY_PS_PATTERNS,
  normalizePsCommand,
  isReadonlyPsCommand,
  matchedDestructiveCategory,
  type NormalizedCommand,
} from './ps-command-patterns';

export {
  DESTRUCTIVE_BASH_PATTERNS,
  normalizeBashCommand,
  matchedDestructiveBashCategory,
  type NormalizedBashCommand,
} from './bash-command-patterns';

/** Tools that mutate filesystem, run commands, or affect git state */
const DANGEROUS_TOOL_PATTERNS: ReadonlySet<string> = new Set([
  'write_file',
  'stream_write_file',
  'fs_write',
  'str_replace',
  'fs_append',
  'shell_execute',
  'execute_shell',
  'delete_file',
  'git_commit',
  'git_push',
  'git_checkout',
  'git_merge',
  'git_rebase',
]);

/** Tools that only read state — always safe to auto-approve */
const SAFE_TOOL_PATTERNS: ReadonlySet<string> = new Set([
  'read_file',
  'search_text',
  'list_directory',
  'get_diagnostics',
  'grep_search',
  'file_search',
]);

/**
 * Determine if a tool requires user approval before execution.
 * @param toolName - The tool name to classify
 * @returns true if the tool is dangerous and needs user consent
 */
export function requiresApproval(toolName: string): boolean {
  if (SAFE_TOOL_PATTERNS.has(toolName)) return false;
  if (DANGEROUS_TOOL_PATTERNS.has(toolName)) return true;

  // Heuristic: git_* tools default to dangerous
  if (toolName.startsWith('git_')) return true;

  // Unknown tools default to safe (MCP tools handled by hook engine)
  return false;
}

/**
 * Get the full set of dangerous tool names.
 * @returns ReadonlySet of tool names requiring approval
 */
export function getDangerousTools(): ReadonlySet<string> {
  return DANGEROUS_TOOL_PATTERNS;
}

/**
 * Get the full set of safe tool names.
 * @returns ReadonlySet of tool names that auto-approve
 */
export function getSafeTools(): ReadonlySet<string> {
  return SAFE_TOOL_PATTERNS;
}
