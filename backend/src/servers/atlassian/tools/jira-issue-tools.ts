/**
 * SA4E-110 - Jira issue CRUD tools (8 tools).
 * get, create, update, delete, types, priorities, statuses, resolutions.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraApiClient } from '../clients/jira-client.js';
import { GetIssueSchema, CreateIssueSchema, UpdateIssueSchema, DeleteIssueSchema } from '../models/jira-schemas.js';
import { createSuccessResult, createErrorResult } from '../models/error-schemas.js';
import { AtlassianErrorCode } from '../models/types.js';
import { AtlassianApiError } from '../clients/base-client.js';

/** Register all Jira issue CRUD tools on the MCP server */
export function registerJiraIssueTools(server: McpServer, client: JiraApiClient): void {
  server.registerTool('jira_get_issue', { description: 'Get a Jira issue by key', inputSchema: GetIssueSchema }, async (args, _extra) => {
    const parsed = GetIssueSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      const res = await client.getIssue(parsed.data.issue_key, parsed.data.fields, parsed.data.expand);
      return createSuccessResult(res.data);
    } catch (e) { return handleError(e); }
  });

  server.registerTool('jira_create_issue', { description: 'Create a new Jira issue', inputSchema: CreateIssueSchema }, async (args, _extra) => {
    const parsed = CreateIssueSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      const { project_key, summary, issue_type, description, assignee, priority, labels, components, custom_fields } = parsed.data;
      const fields: Record<string, unknown> = {
        project: { key: project_key }, summary, issuetype: { name: issue_type },
      };
      if (description) {
        const normalized = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        fields.description = markdownToWiki(normalized);
      }
      if (assignee) fields.assignee = { accountId: assignee };
      if (priority) fields.priority = { name: priority };
      if (labels) fields.labels = labels;
      if (components) fields.components = components.map(c => ({ name: c }));
      if (custom_fields) Object.assign(fields, custom_fields);
      const res = await client.createIssue({ fields });
      return createSuccessResult(res.data);
    } catch (e) { return handleError(e); }
  });

  server.registerTool('jira_update_issue', { description: 'Update fields on a Jira issue', inputSchema: UpdateIssueSchema }, async (args, _extra) => {
    const parsed = UpdateIssueSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      const fields = parsed.data.fields;
      // Normalize line endings to LF to preserve markdown layout (headings, nested lists, smart links)
      if (typeof fields.description === 'string') {
        fields.description = fields.description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        fields.description = markdownToWiki(fields.description);
      }
      await client.updateIssue(parsed.data.issue_key, fields);
      return createSuccessResult({ success: true, issue_key: parsed.data.issue_key });
    } catch (e) { return handleError(e); }
  });

  server.registerTool('jira_delete_issue', { description: 'Delete a Jira issue', inputSchema: DeleteIssueSchema }, async (args, _extra) => {
    const parsed = DeleteIssueSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      await client.deleteIssue(parsed.data.issue_key, parsed.data.delete_subtasks);
      return createSuccessResult({ success: true, deleted: parsed.data.issue_key });
    } catch (e) { return handleError(e); }
  });

  server.tool('jira_get_issue_types', 'Get all available issue types', async () => {
    try { return createSuccessResult((await client.getIssueTypes()).data); }
    catch (e) { return handleError(e); }
  });

  server.tool('jira_get_priorities', 'Get all issue priorities', async () => {
    try { return createSuccessResult((await client.getPriorities()).data); }
    catch (e) { return handleError(e); }
  });

  server.tool('jira_get_statuses', 'Get all issue statuses', async () => {
    try { return createSuccessResult((await client.getStatuses()).data); }
    catch (e) { return handleError(e); }
  });

  server.tool('jira_get_resolutions', 'Get all issue resolutions', async () => {
    try { return createSuccessResult((await client.getResolutions()).data); }
    catch (e) { return handleError(e); }
  });
}

function markdownToWiki(md: string): string {
  // Simple markdown → Jira Wiki markup conversion
  let out = md;
  // Headings
  out = out
    .replace(/^######\s+(.*)$/gm, 'h6. $1')
    .replace(/^#####\s+(.*)$/gm, 'h5. $1')
    .replace(/^####\s+(.*)$/gm, 'h4. $1')
    .replace(/^###\s+(.*)$/gm, 'h3. $1')
    .replace(/^##\s+(.*)$/gm, 'h2. $1')
    .replace(/^#\s+(.*)$/gm, 'h1. $1');
  // Unordered lists
  out = out
    .replace(/^\s*-\s+(.*)$/gm, '* $1');
  // Ordered lists
  out = out
    .replace(/^\s*\d+\.\s+(.*)$/gm, '# $1');
  // Bold **text**
  out = out.replace(/\*\*(.+?)\*\*/g, '*$1*');
  // Italic *text* (avoid list markers: first char after * must not be space)
  out = out.replace(/(^|\s)\*([^\s*][^*]*?)\*(?=\s|$)/g, '$1_$2_');
  // Inline code `code`
  out = out.replace(/`([^`]+)`/g, '{code}$1{code}');
  // Code fences ```lang ... ``` → {code}...{code}
  out = out.replace(/```[\s\S]*?\n([\s\S]*?)```/g, '{code}$1{code}');
  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]');
  return out;
}

function handleError(e: unknown) {
  if (e instanceof AtlassianApiError) return createErrorResult(e.code, e.message);
  return createErrorResult(AtlassianErrorCode.UNKNOWN, (e as Error).message);
}