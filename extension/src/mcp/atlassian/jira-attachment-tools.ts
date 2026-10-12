/**
 * SA4E-110 + SA4E-229 — Jira attachment tools (4 tools) registered in-process.
 * attach_file, get_attachments, delete_attachment (SA4E-110).
 * download_attachment (SA4E-229): download via the extension authenticated session,
 * avoiding the 403 seen when webfetch is used directly.
 * Note: jira_attach_file requires file system access from extension host.
 */
import { readFile } from "fs/promises";
import { basename, extname } from "path";
import {
  registerLocalTool,
  LocalToolDefinition,
  checkSymlinkGuard,
} from "../../backend-local-tools";
import {
  resolveWorkspacePath,
  sanitizeLogText,
  formatFileNotFound,
  formatFsError,
  FILE_PATH_SCHEMA_DESCRIPTION,
} from "../../services/PathResolver";
import { AtlassianHttpClient, toResult, toErrorResult } from "./atlassian-http-client";

/** Register Jira attachment tools */
export function registerJiraAttachmentTools(client: AtlassianHttpClient): void {
  registerTool("jira_attach_file", "Attach a file to a Jira issue", {
    type: "object",
    properties: {
      issue_key: { type: "string" },
      file_path: { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION },
    },
    required: ["issue_key", "file_path"],
  }, async (args) => {
    // SA4E-356: resolve FIRST — before any fs.* and before any HTTP (I-1, I-3).
    const resolution = resolveWorkspacePath(args.file_path);
    if (!resolution.ok) {
      console.warn(`[jira-attachment-tools] jira_attach_file resolve failed: ${resolution.message}`);
      return toErrorResult(new Error(resolution.message));
    }
    // I-7 symlink/junction guard before the pre-upload read.
    const guardError = checkSymlinkGuard(
      resolution,
      sanitizeLogText(String(args.file_path ?? "")),
    );
    if (guardError) {
      console.warn(`[jira-attachment-tools] jira_attach_file guard blocked: ${guardError}`);
      return toErrorResult(new Error(guardError));
    }
    // NOTE: inference (not `: Buffer`) is load-bearing — readFile's narrow
    // return type stays BlobPart-assignable; a wide `: Buffer` annotation
    // breaks `new Blob(...)` under @types/node 22 (ArrayBufferLike).
    const fileBuffer = await readFile(resolution.resolvedPath).catch((err: any) => {
      console.warn(`[jira-attachment-tools] jira_attach_file read failed: ${sanitizeLogText(err?.message ?? String(err))}`);
      if (err?.code === "ENOENT") {
        throw new Error(formatFileNotFound(resolution));
      }
      throw new Error(formatFsError("read", resolution, err));
    });
    const fileName = basename(resolution.resolvedPath);
    const mimeType = getMimeType(extname(fileName));
    const { issue_key } = args as any;
    const blob = new Blob([fileBuffer], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, fileName);
    return toResult(await client.request("POST", `/rest/api/2/issue/${issue_key}/attachments`, formData, {
      isUpload: true, headers: { "X-Atlassian-Token": "no-check" },
    }));
  });

  registerTool("jira_get_attachments", "Get all attachments on a Jira issue", {
    type: "object",
    properties: { issue_key: { type: "string" } },
    required: ["issue_key"],
  }, async (args) => {
    const { issue_key } = args as any;
    return toResult(await client.request("GET", `/rest/api/2/issue/${issue_key}?fields=attachment`));
  });

  registerTool("jira_delete_attachment", "Delete an attachment by ID", {
    type: "object",
    properties: { attachment_id: { type: "string" } },
    required: ["attachment_id"],
  }, async (args) => {
    const { attachment_id } = args as any;
    await client.request("DELETE", `/rest/api/2/attachment/${attachment_id}`);
    return toResult({ status: 204, data: { success: true } });
  });

  registerTool("jira_download_attachment", "Download an attachment's content via the extension authenticated session (fixes 403 on webfetch)", {
    type: "object",
    properties: {
      attachment_id: { type: "string", description: "Jira attachment ID (e.g. 11263)" },
      attachment_url: { type: "string", description: "Full attachment content URL" },
      return_format: { type: "string", enum: ["base64", "text"], default: "base64" },
    },
    required: [],
  }, async (args) => {
    const { attachment_id, attachment_url, return_format } = args as any;
    if (!attachment_id && !attachment_url) {
      return toErrorResult(new Error("VALIDATION_ERROR: provide attachment_id or attachment_url"));
    }
    try {
      let contentUrl = attachment_url;
      let meta: any = undefined;
      if (attachment_id) {
        const metaRes = await client.request("GET", `/rest/api/2/attachment/${attachment_id}`);
        meta = metaRes.data as any;
        contentUrl = meta?.content;
        if (!contentUrl) return toErrorResult(new Error(`NOT_FOUND: attachment ${attachment_id} has no content URL`));
      }
      const path = new URL(contentUrl).pathname + new URL(contentUrl).search;
      const buf = await client.requestRaw("GET", path);
      if (!buf) return toErrorResult(new Error("NOT_FOUND: attachment content could not be downloaded"));
      const mimeType = meta?.mimeType ?? "application/octet-stream";
      const filename = meta?.filename ?? "attachment";
      const size = buf.byteLength;
      const base64 = Buffer.from(buf).toString(return_format === "text" ? "utf8" : "base64");
      return toResult({
        status: 200,
        data: {
          content_base64: return_format === "text" ? undefined : base64,
          content_text: return_format === "text" ? Buffer.from(buf).toString("utf8") : undefined,
          mime_type: mimeType,
          filename,
          size_bytes: size,
        },
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.includes("404") || msg.includes("NOT_FOUND")) return toErrorResult(new Error("NOT_FOUND: attachment not found"));
      if (msg.includes("403")) return toErrorResult(new Error("FORBIDDEN: check Atlassian credentials"));
      return toErrorResult(e);
    }
  });
}

/** Common MIME types for file uploads */
const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json",
  ".xml": "application/xml", ".zip": "application/zip", ".docx":
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".md": "text/markdown", ".html": "text/html",
};

function getMimeType(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] ?? "application/octet-stream";
}

function registerTool(
  name: string, description: string, inputSchema: Record<string, unknown>,
  handler: (args: Record<string, unknown>) => Promise<any>,
): void {
  const def: LocalToolDefinition = { name, description, inputSchema, hidden: true };
  registerLocalTool(name, async (args) => {
    try { return await handler(args); } catch (e) { return toErrorResult(e); }
  }, def);
}
