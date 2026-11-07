/**
 * SA4E-110 - Jira attachment tools (4 tools).
 * attach_file (with path validation), get attachments, delete, meta.
 * P2: validateFilePath with realpath + containment check.
 * SA4E-394 — the legacy ALLOWED_BASES/validateFilePath containment is REPLACED
 * by the shared multi-worktree resolver (TDD §6.4); base_dir/workspace_root
 * select a registered workspace root per call.
 */
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraApiClient } from '../clients/jira-client.js';
import { AttachFileSchema, GetAttachmentsSchema, DeleteAttachmentSchema } from '../models/jira-schemas.js';
import { createSuccessResult, createErrorResult } from '../models/error-schemas.js';
import { AtlassianErrorCode } from '../models/types.js';
import { AtlassianApiError } from '../clients/base-client.js';
import { getMimeType } from '../utils/mime-types.js';
import { resolveAttachmentPath, finalizeAttachmentPath } from './path-resolution.js';

/** Register Jira attachment tools with path security validation */
export function registerJiraAttachmentTools(server: McpServer, client: JiraApiClient): void {
  server.registerTool('jira_attach_file', { description: 'Attach a file to a Jira issue (path validated)', inputSchema: AttachFileSchema }, async (args, _extra) => {
    const parsed = AttachFileSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      const resolution = resolveAttachmentPath(parsed.data);
      if (!resolution.ok) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, resolution.message);
      const finalPath = await finalizeAttachmentPath(resolution.resolved);
      if (finalPath === null) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, 'File not found or inaccessible');

      const fileBuffer = await readFile(finalPath);
      const fileName = basename(finalPath);
      const mimeType = getMimeType(extname(fileName));

      const blob = new Blob([fileBuffer], { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, fileName);

      const res = await client.attachFile(parsed.data.issue_key, formData);
      return createSuccessResult(res.data);
    } catch (e) { return handleError(e); }
  });

  server.registerTool('jira_get_attachments', { description: 'Get all attachments on a Jira issue', inputSchema: GetAttachmentsSchema }, async (args, _extra) => {
    const parsed = GetAttachmentsSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      const res = await client.getIssue(parsed.data.issue_key, 'attachment');
      return createSuccessResult(res.data);
    } catch (e) { return handleError(e); }
  });

  server.registerTool('jira_delete_attachment', { description: 'Delete an attachment by ID', inputSchema: DeleteAttachmentSchema }, async (args, _extra) => {
    const parsed = DeleteAttachmentSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      await client.deleteAttachment(parsed.data.attachment_id);
      return createSuccessResult({ success: true });
    } catch (e) { return handleError(e); }
  });

  server.tool('jira_attachment_meta', 'Get attachment upload metadata/limits', async () => {
    try { return createSuccessResult((await client.getAttachmentMeta()).data); }
    catch (e) { return handleError(e); }
  });
}

/** P2/SA4E-394: path validation moved to tools/path-resolution.ts (shared resolver). */

function handleError(e: unknown) {
  if (e instanceof AtlassianApiError) return createErrorResult(e.code, e.message);
  return createErrorResult(AtlassianErrorCode.UNKNOWN, (e as Error).message);
}