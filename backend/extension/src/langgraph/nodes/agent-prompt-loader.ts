/**
 * Agent Prompt Loader — extracted from BaseNode (KSA-242)
 * Loads and filters agent system prompts from .kiro/agents/ files.
 */

import { readWorkspaceFile } from "./workspace-file-ops";

/**
 * Load agent system prompt from .kiro/agents/{agentName}.md.
 * Strips workflow/tool-call sections, keeping only role + quality rules.
 */
export async function loadAgentPrompt(agentName: string, fallback: string): Promise<string> {
  const content = await readWorkspaceFile(`.kiro/agents/${agentName}.md`);
  if (!content) return fallback;

  const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  const body = fmMatch ? fmMatch[1].trim() : content.trim();

  const filtered = extractRoleSections(body);
  if (filtered.length < 100) return fallback;
  if (filtered.length > 20000) {
    return filtered.slice(0, 20000) + "\n\n[...truncated for context budget]";
  }
  return filtered;
}

/**
 * Extract role description and quality rules from agent markdown.
 * Excludes sections that contain tool-call instructions or workflow steps.
 */
function extractRoleSections(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inWorkflowSection = false;
  let currentHeadingLevel = 0;

  const workflowPatterns = [
    /^##\s*(step\s+\d|workflow|tool\s+discovery)/i,
    /^###\s*step\s+\d/i,
    /^##\s*⚙️\s*tool\s+discovery/i,
    /^##\s*input\s+format/i,
    /^###\s*step\s+\d.*:(.*fetch|read|export|ingest|generate|write)/i,
  ];

  const includePatterns = [
    /^##\s*(language|document\s+types|diagram|quality|rules|brd\s+template|fsd\s+template)/i,
    /^##\s*(mandatory|critical)/i,
    /^you\s+are\s+a\s+senior/i,
  ];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      if (workflowPatterns.some(p => p.test(line))) {
        inWorkflowSection = true;
        currentHeadingLevel = level;
        continue;
      }
      if (includePatterns.some(p => p.test(line)) || level <= currentHeadingLevel) {
        inWorkflowSection = false;
      }
      if (inWorkflowSection && level <= currentHeadingLevel) {
        inWorkflowSection = false;
      }
    }

    if (!inWorkflowSection) {
      if (isToolCallLine(line)) continue;
      result.push(line);
    }
  }

  return result.join("\n").trim();
}

function isToolCallLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^\d+\.\s*(Use\s+`?(readFile|fsWrite|executePwsh|stream_write_file|mem_ingest|mem_search|embed_images|export_docx))/i.test(trimmed)) return true;
  if (/^\s*&\s+"C:\\Program Files/.test(trimmed)) return true;
  if (/^\s*(the discovered|Use the discovered)\s+\*\*/.test(trimmed)) return true;
  return false;
}
