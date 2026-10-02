/**
 * PiCodingTools — SA4E-333 Phase 1 / SA4E-336 OS-aware shell.
 * Builds workspace-aware systemPrompt + file tools from pi-coding-agent.
 * SRP: only tool/systemPrompt construction, no engine logic.
 *
 * SA4E-336: the shell tool is now OS-aware — native Windows PowerShell on win32
 * (via createPowerShellToolSafe, NO shellPath — BR-07) and bash on non-win32.
 * The legacy Git-Bash workaround (resolveGitBashPath shellPath pin +
 * normalizeBashCommandPaths spawnHook) is retired: on Windows the native pwsh
 * tool understands c:\ / c:/ paths directly, so no dialect translation is
 * needed; on non-Windows bash never saw Windows paths.
 */
import { debugLog } from '../debug-logger';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { createWorkspaceInfoTool, withNotFoundHint } from './workspace-info-tool.js';
import { createPowerShellToolSafe, isWindows } from './shell-tool-factory.js';

/**
 * Dialect note prepended to the bash tool description (non-win32) so the model
 * sees the shell contract at tool-selection time.
 */
export const BASH_DIALECT_NOTE =
  'Shell is Bash (POSIX) — use ls (never `dir /b`), forward-slash paths. ' +
  'Prefer the dedicated ls/read/grep/find tools over bash for file exploration. ';

export function withBashDialectHint<T extends AgentTool>(tool: T): T {
  if (!tool.description || tool.description.includes('Shell is Bash (POSIX)')) return tool;
  return { ...tool, description: BASH_DIALECT_NOTE + tool.description };
}

/** Shared system-prompt guidance (OS-independent). */
function sharedPromptLines(normalizedRoot: string): string[] {
  return [
    `Workspace root: ${normalizedRoot || '(unknown)'}`,
    `You are running inside the SDLC Agents VS Code extension chat.`,
    `Always resolve relative file paths against the workspace root above.`,
    `When asked where you are / workspace path, answer with the workspace root verbatim.`,
    `Work autonomously in one go: explore with your file tools (read/grep/find/ls) and finish the task instead of narrating plans.`,
    `Ask the user a question ONLY when blocked (missing credentials, ambiguous destructive action, genuinely unclear scope).`,
    `Never ask scoping questions when the request already states the scope (e.g. "review the whole repo" means the whole workspace).`,
    `Prefer read/grep/find/ls tools over the shell for exploring files.`,
    `ALWAYS build absolute paths from the exact Workspace root above — never guess the drive letter.`,
    `If a path does not exist, stop and re-list from the workspace root — never guess deeper nested paths.`,
    `For repo-wide reviews: work top-level folder by folder and print one progress line per folder as you go.`,
    `For exploration/review tasks, call get_workspace_info first to see the real layout.`,
    `NEVER paste shell commands for the user to run — always EXECUTE them yourself with your tools.`,
  ];
}

/**
 * OS-aware system prompt (SA4E-336): PowerShell dialect on win32, bash on
 * non-win32, so the model emits the right shell syntax for the active tool.
 * @param workspaceRoot absolute workspace root
 */
export function buildWorkspaceSystemPrompt(workspaceRoot: string): string {
  const normalized = (workspaceRoot || '').replace(/\\/g, '/');
  const shared = sharedPromptLines(normalized);
  if (isWindows()) {
    return [
      ...shared,
      `The shell tool is Windows PowerShell (pwsh).`,
      `Use PowerShell cmdlets (Get-ChildItem/Get-Content/Test-Path) or their aliases (ls/cat/dir all work).`,
      `Windows paths work as-is (c:\\... or c:/...) — no translation needed.`,
    ].join('\n');
  }
  return [
    ...shared,
    `The shell tool is Bash (POSIX).`,
    `Use forward slashes: ls not dir /b.`,
    `Paths: /c/... instead of c:\\...`,
  ].join('\n');
}

/** Path-taking tools that self-correct with the real layout on not-found errors. */
const PATH_TOOLS = new Set(['read', 'ls', 'find', 'grep', 'edit']);

/** Build the OS-aware shell tool (powershell on win32, bash elsewhere). */
function buildShellTool(m: typeof import('@earendil-works/pi-coding-agent'), workspaceRoot: string): AgentTool | null {
  if (isWindows()) return createPowerShellToolSafe(m, workspaceRoot);
  const bash = m.createBashTool(workspaceRoot) as unknown as AgentTool;
  return withBashDialectHint(bash);
}

/**
 * Create all built-in coding tools (read/write/edit/{powershell|bash}/grep/find/ls)
 * bound to workspaceRoot as cwd. Returns [] on failure (never throws).
 * @param workspaceRoot absolute workspace root (cwd)
 */
export async function createWorkspaceTools(workspaceRoot: string): Promise<AgentTool[]> {
  if (!workspaceRoot) return [];
  try {
    const m = await import('@earendil-works/pi-coding-agent');
    const shellTool = buildShellTool(m, workspaceRoot);
    const core = [
      m.createReadTool(workspaceRoot),
      m.createWriteTool(workspaceRoot),
      m.createEditTool(workspaceRoot),
      shellTool,
      m.createGrepTool(workspaceRoot),
      m.createFindTool(workspaceRoot),
      m.createLsTool(workspaceRoot),
    ].filter(Boolean) as unknown as AgentTool[];
    const tools: AgentTool[] = [
      ...core.map((t) => (PATH_TOOLS.has(t.name) ? withNotFoundHint(t, workspaceRoot) : t)),
      createWorkspaceInfoTool(workspaceRoot),
    ];
    debugLog(`[PiCodingTools] bound ${tools.length} tools to ${workspaceRoot}`);
    return tools;
  } catch (err) {
    debugLog(`[PiCodingTools] create tools failed (non-fatal): ${(err as Error).message}`);
    return [];
  }
}
