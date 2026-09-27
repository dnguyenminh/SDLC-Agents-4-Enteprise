/**
 * Hook Tool Matcher — extracted from HookEngine
 * Tool category classification for the diagnostics feed.
 */

const TOOL_CATEGORIES: Record<string, string> = {
  readFile: "read", read_file: "read", read_code: "read", read_files: "read",
  grep_search: "read", file_search: "read", list_directory: "read",
  get_diagnostics: "read", get_process_output: "read",
  fs_write: "write", str_replace: "write", fs_append: "write",
  delete_file: "write", stream_write_file: "write",
  write_file: "write",            // ← SA4E-185 OI-1: primary VS Code write tool
  execute_pwsh: "shell", control_pwsh_process: "shell",
  execute_shell: "shell",
  web_search: "web", fetch_url: "web",
};

export function classifyTool(toolName: string): string {
  return TOOL_CATEGORIES[toolName] || "other";
}

export function extractFilePath(toolName: string, args: Record<string, unknown>): string | null {
  if (args.path && typeof args.path === "string") return args.path;
  if (args.file_path && typeof args.file_path === "string") return args.file_path;
  if (args.targetFile && typeof args.targetFile === "string") return args.targetFile;
  if (toolName === "str_replace" && args.path) return args.path as string;
  return null;
}

