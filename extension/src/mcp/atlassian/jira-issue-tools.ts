/**
 * SA4E-110 — Jira issue CRUD tools (8 tools) registered in-process.
 * get, create, update, delete, issue_types, priorities, statuses, resolutions.
 */
import { registerLocalTool, LocalToolDefinition } from "../../backend-local-tools";
import { AtlassianHttpClient, toResult, toErrorResult } from "./atlassian-http-client";

/** Register all Jira issue CRUD tools into the local tool registry */
export function registerJiraIssueTools(client: AtlassianHttpClient): void {
  register("jira_get_issue", "Get a Jira issue by key", {
    type: "object",
    properties: {
      issue_key: { type: "string", description: "Issue key (e.g. PROJ-123)" },
      fields: { type: "string", description: "Comma-separated fields to return" },
      expand: { type: "string", description: "Comma-separated expansions" },
    },
    required: ["issue_key"],
  }, async (args) => {
    const { issue_key, fields, expand } = args as any;
    const params = new URLSearchParams();
    if (fields) params.set("fields", fields);
    if (expand) params.set("expand", expand);
    const qs = params.toString() ? `?${params}` : "";
    return toResult(await client.request("GET", `/rest/api/2/issue/${issue_key}${qs}`));
  });

  register("jira_create_issue", "Create a new Jira issue", {
    type: "object",
    properties: {
      project_key: { type: "string" }, summary: { type: "string" },
      issue_type: { type: "string" }, description: { type: "string" },
      assignee: { type: "string" }, priority: { type: "string" },
      labels: { type: "array", items: { type: "string" } },
      components: { type: "array", items: { type: "string" } },
      custom_fields: { type: "object" },
    },
    required: ["project_key", "summary", "issue_type"],
  }, async (args) => {
    const { project_key, summary, issue_type, description, assignee, priority, labels, components, custom_fields } = args as any;
    const fields: Record<string, unknown> = {
      project: { key: project_key }, summary, issuetype: { name: issue_type },
    };
    if (description) {
      const normalized = String(description).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      fields.description = markdownToWiki(normalized);
    }
    if (assignee) fields.assignee = { accountId: assignee };
    if (priority) fields.priority = { name: priority };
    if (labels) fields.labels = labels;
    if (components) fields.components = components.map((c: string) => ({ name: c }));
    if (custom_fields) Object.assign(fields, custom_fields);
    return toResult(await client.request("POST", "/rest/api/2/issue", { fields }));
  });

  register("jira_update_issue", "Update fields on a Jira issue", {
    type: "object",
    properties: {
      issue_key: { type: "string" }, fields: { type: "object" },
    },
    required: ["issue_key", "fields"],
  }, async (args) => {
    const { issue_key, fields } = args as any;
    const safeFields = { ...fields };
    if (typeof safeFields.description === 'string') {
      const normalized = safeFields.description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      safeFields.description = markdownToWiki(normalized);
    }
    await client.request("PUT", `/rest/api/2/issue/${issue_key}`, { fields: safeFields });
    return toResult({ status: 204, data: { success: true, issue_key } });
  });

  register("jira_delete_issue", "Delete a Jira issue", {
    type: "object",
    properties: {
      issue_key: { type: "string" },
      delete_subtasks: { type: "boolean", default: false },
    },
    required: ["issue_key"],
  }, async (args) => {
    const { issue_key, delete_subtasks } = args as any;
    const qs = delete_subtasks ? "?deleteSubtasks=true" : "";
    await client.request("DELETE", `/rest/api/2/issue/${issue_key}${qs}`);
    return toResult({ status: 204, data: { success: true, deleted: issue_key } });
  });

  registerSimpleGet(client, "jira_get_issue_types", "Get all available issue types", "/rest/api/2/issuetype");
  registerSimpleGet(client, "jira_get_priorities", "Get all issue priorities", "/rest/api/2/priority");
  registerSimpleGet(client, "jira_get_statuses", "Get all issue statuses", "/rest/api/2/status");
  registerSimpleGet(client, "jira_get_resolutions", "Get all issue resolutions", "/rest/api/2/resolution");
}

/** Helper: register a tool with hidden:true */
function register(
  name: string, description: string,
  inputSchema: Record<string, unknown>, handler: (args: Record<string, unknown>) => Promise<any>,
): void {
  const def: LocalToolDefinition = { name, description, inputSchema, hidden: true };
  registerLocalTool(name, async (args) => {
    try { return await handler(args); }
    catch (e) { return toErrorResult(e); }
  }, def);
}

/** Helper: register a no-args GET tool */
function registerSimpleGet(client: AtlassianHttpClient, name: string, desc: string, path: string): void {
  const def: LocalToolDefinition = { name, description: desc, inputSchema: { type: "object", properties: {}, required: [] }, hidden: true };
  registerLocalTool(name, async () => {
    try { return toResult(await client.request("GET", path)); }
    catch (e) { return toErrorResult(e); }
  }, def);
}

function markdownToWiki(md: string): string {
  let out = md;
  out = out
    .replace(/^######\s+(.*)$/gm, 'h6. $1')
    .replace(/^#####\s+(.*)$/gm, 'h5. $1')
    .replace(/^####\s+(.*)$/gm, 'h4. $1')
    .replace(/^###\s+(.*)$/gm, 'h3. $1')
    .replace(/^##\s+(.*)$/gm, 'h2. $1')
    .replace(/^#\s+(.*)$/gm, 'h1. $1');
  out = out.replace(/^\s*-\s+(.*)$/gm, '* $1');
  out = out.replace(/^\s*\d+\.\s+(.*)$/gm, '# $1');
  out = out.replace(/\*\*(.+?)\*\*/g, '*$1*');
  out = out.replace(/(^|\s)\*([^\s*][^*]*?)\*(?=\s|$)/g, '$1_$2_');
  out = out.replace(/`([^`]+)`/g, '{code}$1{code}');
  out = out.replace(/```[\s\S]*?\n([\s\S]*?)```/g, '{code}$1{code}');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]');
  return out;
}
