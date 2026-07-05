/**
 * WorkflowParser action patterns --- KSA-243
 * Keyword-to-ActionType mapping and helper extractors.
 */

export type ActionType =
  | "read_template" | "read_file" | "fetch_jira" | "fetch_jira_recursive"
  | "kb_search" | "kb_ingest" | "kb_ingest_file" | "read_code_intelligence"
  | "generate_llm" | "write_file" | "append_file" | "export_docx"
  | "export_drawio_png" | "exec_shell" | "exec_git" | "discover_tools"
  | "load_skill" | "stream_status" | "validate" | "unknown";

export interface StepAction {
  type: ActionType;
  description: string;
  params: Record<string, string>;
}

interface ActionPattern {
  pattern: RegExp;
  type: ActionType;
  paramExtractor?: (match: RegExpMatchArray, line: string) => Record<string, string>;
}

export const ACTION_PATTERNS: ActionPattern[] = [
  { pattern: /read.*template|template.*read/i, type: "read_template", paramExtractor: (_m, line) => ({ path: extractPath(line) || "documents/templates/" }) },
  { pattern: /readFile|read\s+.*\.(md|txt|yml|yaml|json|kt|ts)/i, type: "read_file", paramExtractor: (_m, line) => ({ path: extractPath(line) || "" }) },
  { pattern: /fetch.*jira.*recursive|linked.*ticket.*recursive/i, type: "fetch_jira_recursive" },
  { pattern: /fetch.*ticket|get.*issue|jira.*ticket/i, type: "fetch_jira" },
  { pattern: /mem_search|kb.*search|knowledge.*base.*search|search.*KB/i, type: "kb_search", paramExtractor: (_m, line) => ({ query: extractQuoted(line) || "" }) },
  { pattern: /mem_ingest_file|ingest.*file.*KB/i, type: "kb_ingest_file", paramExtractor: (_m, line) => ({ path: extractPath(line) || "" }) },
  { pattern: /mem_ingest|ingest.*KB|KB.*ingest|knowledge.*base.*ingest/i, type: "kb_ingest" },
  { pattern: /code.?intelligence|\.analysis\/code-intelligence/i, type: "read_code_intelligence" },
  { pattern: /generate.*BRD|generate.*FSD|generate.*TDD|generate.*document|create.*document|LLM.*generat/i, type: "generate_llm" },
  { pattern: /stream_write_file|write.*file|create.*at.*documents\//i, type: "write_file", paramExtractor: (_m, line) => ({ path: extractPath(line) || "" }) },
  { pattern: /export_docx|export.*DOCX|MS\s*Word/i, type: "export_docx" },
  { pattern: /export.*PNG|draw\.io.*export|drawio_export_png/i, type: "export_drawio_png" },
  { pattern: /executePwsh|exec.*shell|run.*command|npm.*run|gradlew/i, type: "exec_shell", paramExtractor: (_m, line) => ({ command: extractCommand(line) || "" }) },
  { pattern: /git\s+(checkout|add|commit|push|branch)/i, type: "exec_git", paramExtractor: (_m, line) => ({ args: extractGitArgs(line) || "" }) },
  { pattern: /find_tools|discover.*tools/i, type: "discover_tools" },
  { pattern: /\.kiro\/steering\/.*\.md|contextFiles|load.*skill/i, type: "load_skill", paramExtractor: (_m, line) => ({ path: extractSteeringPath(line) || "" }) },
];

/** Infer action type from a single line of text. */
export function inferActions(line: string): StepAction[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("<!--") || trimmed === "---") return [];
  for (const { pattern, type, paramExtractor } of ACTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return [{ type, description: trimmed, params: paramExtractor ? paramExtractor(match, trimmed) : {} }];
    }
  }
  return [];
}

// === Helper extractors ===

function extractPath(line: string): string | null {
  const match = line.match(/[`"']?((?:documents|\.analysis|\.kiro)\/[^\s`"',)]+)[`"']?/);
  return match ? match[1] : null;
}

function extractQuoted(line: string): string | null {
  const match = line.match(/["']([^"']+)["']/);
  return match ? match[1] : null;
}

function extractCommand(line: string): string | null {
  const match = line.match(/`([^`]+)`/) || line.match(/(?:run|execute)\s+(.+)/i);
  return match ? match[1].trim() : null;
}

function extractGitArgs(line: string): string | null {
  const match = line.match(/git\s+(.+)/i);
  return match ? match[1].trim() : null;
}

function extractSteeringPath(line: string): string | null {
  const match = line.match(/(\.kiro\/steering\/[\w-]+\.md)/);
  return match ? match[1] : null;
}

export function extractCondition(title: string): string | undefined {
  const match = title.match(/\((?:if|only\s+for|when)\s+([^)]+)\)/i);
  return match ? match[1] : undefined;
}
