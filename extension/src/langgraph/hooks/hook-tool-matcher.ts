/**
 * Hook Tool Matcher — extracted from HookEngine
 * Tool category classification and matching logic for hook system.
 */

import type { HookDefinition } from "./hook-loader";

const TOOL_CATEGORIES: Record<string, string> = {
  readFile: "read", read_file: "read", read_code: "read", read_files: "read",
  grep_search: "read", file_search: "read", list_directory: "read",
  get_diagnostics: "read", get_process_output: "read",
  fs_write: "write", str_replace: "write", fs_append: "write",
  delete_file: "write", stream_write_file: "write",
  execute_pwsh: "shell", control_pwsh_process: "shell",
  web_search: "web", fetch_url: "web",
};

export function classifyTool(toolName: string): string {
  return TOOL_CATEGORIES[toolName] || "other";
}

export function getMatchingToolHooks(
  hooks: HookDefinition[],
  eventType: "preToolUse" | "postToolUse",
  toolName: string,
  category: string
): HookDefinition[] {
  return hooks.filter(h => {
    if (h.when.type !== eventType) return false;
    return matchesToolType(h, toolName, category);
  });
}

function matchesToolType(hook: HookDefinition, toolName: string, category: string): boolean {
  const toolTypes = hook.when.toolTypes;
  if (!toolTypes || toolTypes.length === 0) return true;
  return toolTypes.some(pattern => {
    if (pattern === "*") return true;
    if (pattern === category) return true;
    if (pattern === toolName) return true;
    try { return new RegExp(pattern).test(toolName); }
    catch { return false; }
  });
}

export function extractFilePath(toolName: string, args: Record<string, unknown>): string | null {
  if (args.path && typeof args.path === "string") return args.path;
  if (args.file_path && typeof args.file_path === "string") return args.file_path;
  if (args.targetFile && typeof args.targetFile === "string") return args.targetFile;
  if (toolName === "str_replace" && args.path) return args.path as string;
  return null;
}

export function matchGlob(pattern: string, filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*");
  try {
    return new RegExp(`^${regex}$`).test(normalizedPath) || new RegExp(regex).test(normalizedPath);
  } catch { return false; }
}
