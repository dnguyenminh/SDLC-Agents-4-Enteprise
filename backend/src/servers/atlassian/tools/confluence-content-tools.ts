/**
 * SA4E-110 - Confluence content tools (5 tools).
 * attachments, add_attachment, macros, history, version.
 * SA4E-394 — the legacy ALLOWED_BASES/validateFilePath containment is REPLACED
 * by the shared multi-worktree resolver (TDD §6.4); base_dir/workspace_root
 * select a registered workspace root per call.
 */
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ConfluenceApiClient } from '../clients/confluence-client.js';
import { AttachmentsSchema, AddAttachmentSchema, MacrosSchema, HistorySchema, VersionSchema } from '../models/confluence-schemas.js';
import { createSuccessResult, createErrorResult } from '../models/error-schemas.js';
import { AtlassianErrorCode } from '../models/types.js';
import { AtlassianApiError } from '../clients/base-client.js';
import { getMimeType } from '../utils/mime-types.js';
import { resolveAttachmentPath, finalizeAttachmentPath } from './path-resolution.js';

/** Register Confluence content and attachment tools */
export function registerConfluenceContentTools(server: McpServer, client: ConfluenceApiClient): void {
  server.registerTool('confluence_get_attachments', { description: 'Get page attachments', inputSchema: AttachmentsSchema }, async (args, _extra) => {
    const parsed = AttachmentsSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try { return createSuccessResult((await client.getAttachments(parsed.data.page_id, parsed.data.start, parsed.data.limit)).data); }
    catch (e) { return handleError(e); }
  });

  server.registerTool('confluence_add_attachment', { description: 'Upload a file to a page', inputSchema: AddAttachmentSchema }, async (args, _extra) => {
    const parsed = AddAttachmentSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      const resolution = resolveAttachmentPath(parsed.data);
      if (!resolution.ok) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, resolution.message);
      const finalPath = await finalizeAttachmentPath(resolution.resolved);
      if (finalPath === null) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, 'File not found or inaccessible');
      const fileBuffer = await readFile(finalPath);
      const fileName = basename(finalPath);
      const blob = new Blob([fileBuffer], { type: getMimeType(extname(fileName)) });
      const formData = new FormData();
      formData.append('file', blob, fileName);
      return createSuccessResult((await client.addAttachment(parsed.data.page_id, formData)).data);
    } catch (e) { return handleError(e); }
  });

  server.registerTool('confluence_get_macros', { description: 'Get macros used in a page', inputSchema: MacrosSchema }, async (args, _extra) => {
    const parsed = MacrosSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try {
      const res = await client.getPage(parsed.data.page_id, 'body.storage');
      return createSuccessResult(res.data);
    } catch (e) { return handleError(e); }
  });

  server.registerTool('confluence_get_history', { description: 'Get page edit history', inputSchema: HistorySchema }, async (args, _extra) => {
    const parsed = HistorySchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try { return createSuccessResult((await client.getHistory(parsed.data.page_id)).data); }
    catch (e) { return handleError(e); }
  });

  server.registerTool('confluence_get_version', { description: 'Get a specific page version', inputSchema: VersionSchema }, async (args, _extra) => {
    const parsed = VersionSchema.safeParse(args);
    if (!parsed.success) return createErrorResult(AtlassianErrorCode.VALIDATION_ERROR, parsed.error.message);
    try { return createSuccessResult((await client.getVersion(parsed.data.page_id, parsed.data.version_number)).data); }
    catch (e) { return handleError(e); }
  });
}

/** SA4E-394: path validation moved to tools/path-resolution.ts (shared resolver). */

function handleError(e: unknown) {
  if (e instanceof AtlassianApiError) return createErrorResult(e.code, e.message);
  return createErrorResult(AtlassianErrorCode.UNKNOWN, (e as Error).message);
}