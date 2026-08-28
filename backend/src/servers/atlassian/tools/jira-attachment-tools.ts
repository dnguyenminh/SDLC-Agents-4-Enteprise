/**
 * SA4E-110 - Jira attachment tools (4 tools).
 * attach_file (with path validation), get attachments, delete, meta.
 * P2: validateFilePath with realpath + containment check.
 */
import { readFile, realpath } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraApiClient } from '../clients/jira-client.js';
import { AttachFileSchema, GetAttachmentsSchema, DeleteAttachmentSchema, DownloadAttachmentSchema } from '../models/jira-schemas.js';
import { createSuccessResult, createErrorResult } from '../models/error-schemas.js';
import { AtlassianErrorCode } from '../models/types.js';
import { AtlassianApiError } from '../clients/base-client.js';
import { getMimeType } from '../utils/mime-types.js';

/** Allowed base directories for file uploads */
const ALLOWED_BASES = [process.cwd()];

/** Register Jira attachment tools with path security validation */
export function registerJiraAttachmentTools(server: McpServer, client: JiraApiClient): void {
  server.registerTool('jira_attach_file', { description: 'Attach a file to a Jira issue (path validated)', inputSchema: AttachFileSchema }, async (args, _extra) => {
    const parsed = AttachFileSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      const validPath = await validateFilePath(parsed.data.file_path);
      if (!validPath.valid) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, validPath.error!);

      const fileBuffer = await readFile(validPath.resolved!);
      const fileName = basename(validPath.resolved!);
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

  server.registerTool('jira_download_attachment', {
    description: 'Download Jira attachment content using authenticated session (by ID or URL). Returns base64 content and metadata.',
    inputSchema: DownloadAttachmentSchema,
  }, async (args, _extra) => {
    const parsed = DownloadAttachmentSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);

    try {
      let downloadUrl: string;

      if (parsed.data.attachment_url) {
        downloadUrl = parsed.data.attachment_url;
      } else if (parsed.data.attachment_id) {
        // Resolve ID to content URL via attachment metadata
        const meta = await client.getAttachment(parsed.data.attachment_id);
        const contentUrl = (meta.data as { content?: string } | undefined)?.content as string | undefined;
        if (!contentUrl) {
          return createErrorResult(AtlassianErrorCode.NOT_FOUND, 'Attachment content URL not found');
        }
        downloadUrl = contentUrl;
      } else {
        return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, 'Either attachment_id or attachment_url is required');
      }

      const result = await client.downloadAttachment(downloadUrl);
      const contentBase64 = result.buffer.toString('base64');

      return createSuccessResult({
        content_base64: contentBase64,
        mime_type: result.mimeType,
        size_bytes: result.size,
        filename: result.filename,
      });
    } catch (e) {
      return handleError(e);
    }
  });
}

/** P2: Validate file path - resolve symlinks and check containment */
async function validateFilePath(filePath: string): Promise<{ valid: boolean; resolved?: string; error?: string }> {
  try {
    const resolved = await realpath(resolve(filePath));
    const isContained = ALLOWED_BASES.some(base => resolved.startsWith(base));
    if (!isContained) return { valid: false, error: 'File path outside allowed directory' };
    return { valid: true, resolved };
  } catch {
    return { valid: false, error: 'File not found or inaccessible' };
  }
}

function handleError(e: unknown) {
  if (e instanceof AtlassianApiError) return createErrorResult(e.code, e.message);
  return createErrorResult(AtlassianErrorCode.UNKNOWN, (e as Error).message);
}