/**
 * Jira Helpers — extracted from BaseNode (KSA-242)
 * Provides Jira issue fetching and recursive link traversal for pipeline nodes.
 */

import { debugError } from "../../debug-logger";
import type { McpBridge } from "../mcp-bridge";

/** Per-tool call timeout (60s) */
const TOOL_CALL_TIMEOUT_MS = 60_000;

export async function callDynamicTool(
  toolName: string, args: Record<string, unknown>, mcpBridge: McpBridge
): Promise<string> {
  return mcpBridge.callTool("execute_dynamic_tool", {
    tool_name: toolName, arguments: args,
  }, TOOL_CALL_TIMEOUT_MS);
}

export async function getJiraIssue(issueKey: string, mcpBridge: McpBridge): Promise<string> {
  return callDynamicTool("jira_get_issue", {
    issue_key: issueKey, fields: "*all", expand: "renderedFields",
  }, mcpBridge);
}

export async function getJiraIssueFields(
  issueKey: string, fields: string, mcpBridge: McpBridge
): Promise<string> {
  return callDynamicTool("jira_get_issue", { issue_key: issueKey, fields }, mcpBridge);
}

export async function searchJira(jql: string, mcpBridge: McpBridge): Promise<string> {
  return callDynamicTool("jira_search", { jql }, mcpBridge);
}

export async function getJiraIssueRecursive(
  issueKey: string, mcpBridge: McpBridge, maxDepth = 2, maxTickets = 10
): Promise<string> {
  const visited = new Set<string>();
  const results: string[] = [];
  await traverseJiraLinks(issueKey, 0, maxDepth, maxTickets, visited, results, mcpBridge);
  return results.join("\n\n---\n\n");
}

async function traverseJiraLinks(
  issueKey: string,
  currentDepth: number,
  maxDepth: number,
  maxTickets: number,
  visited: Set<string>,
  results: string[],
  mcpBridge: McpBridge
): Promise<void> {
  if (visited.has(issueKey)) return;
  if (visited.size >= maxTickets) return;
  if (currentDepth > maxDepth) return;

  visited.add(issueKey);

  try {
    const issueData = await getJiraIssue(issueKey, mcpBridge);
    const prefix = currentDepth === 0 ? "## MAIN TICKET" : `## LINKED (depth ${currentDepth})`;
    results.push(`${prefix}: ${issueKey}\n\n${issueData}`);

    const linkedKeys = extractLinkedKeys(issueData, issueKey);
    for (const linkedKey of linkedKeys) {
      if (visited.size >= maxTickets) break;
      await traverseJiraLinks(linkedKey, currentDepth + 1, maxDepth, maxTickets, visited, results, mcpBridge);
    }
  } catch (err) {
    debugError(`[JiraHelpers] traversal failed for ${issueKey}`, err as Error);
    results.push(`## ${issueKey} — [fetch failed]`);
  }
}

function extractLinkedKeys(issueData: string, selfKey: string): string[] {
  const keys: string[] = [];
  const keyPattern = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;
  let match: RegExpExecArray | null;

  while ((match = keyPattern.exec(issueData)) !== null) {
    const key = match[1];
    if (key !== selfKey && !keys.includes(key)) keys.push(key);
  }
  return keys.slice(0, 8);
}
