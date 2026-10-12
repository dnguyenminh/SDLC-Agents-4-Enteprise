/**
 * SA4E-110 — Confluence content tools (7 tools) registered in-process.
 * Attachments, history, version, page_analytics, comments.
 */
import { checkSymlinkGuard, registerLocalTool, LocalToolDefinition } from "../../backend-local-tools";
import {
  resolveWorkspacePath,
  sanitizeLogText,
  formatFileNotFound,
  formatFsError,
  FILE_PATH_SCHEMA_DESCRIPTION,
} from "../../services/PathResolver";
import { AtlassianHttpClient, toResult, toErrorResult } from "./atlassian-http-client";

/** Register Confluence content and comment tools (7 tools) */
export function registerConfluenceContentTools(client: AtlassianHttpClient): void {
  reg("confluence_get_attachments", "Get page attachments", {
    type: "object",
    properties: { page_id: { type: "string" }, start: { type: "number", default: 0 }, limit: { type: "number", default: 25 } },
    required: ["page_id"],
  }, async (a) => {
    return toResult(await client.request("GET", `/wiki/rest/api/content/${a.page_id}/child/attachment?start=${a.start ?? 0}&limit=${a.limit ?? 25}`));
  });

  reg("confluence_add_attachment", "Upload a file to a page", {
    type: "object",
    properties: {
      page_id: { type: "string" },
      file_path: { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION },
    },
    required: ["page_id", "file_path"],
  }, async (a) => {
    // SA4E-356: resolve FIRST — before FormData/HTTP (I-1, I-3).
    const resolution = resolveWorkspacePath(a.file_path);
    if (!resolution.ok) {
      console.warn(`[confluence-content-tools] confluence_add_attachment resolve failed: ${resolution.message}`);
      return toErrorResult(new Error(resolution.message));
    }
    // I-7 symlink/junction guard before the pre-upload read.
    const guardError = checkSymlinkGuard(
      resolution,
      sanitizeLogText(String(a.file_path ?? "")),
    );
    if (guardError) {
      console.warn(`[confluence-content-tools] confluence_add_attachment guard blocked: ${guardError}`);
      return toErrorResult(new Error(guardError));
    }
    const { readFile: rf } = await import("fs/promises");
    const { basename: bn } = await import("path");
    // NOTE: inference (not `: Buffer`) is load-bearing — see jira-attachment-tools.
    const buf = await rf(resolution.resolvedPath).catch((err: any) => {
      console.warn(`[confluence-content-tools] confluence_add_attachment read failed: ${sanitizeLogText(err?.message ?? String(err))}`);
      if (err?.code === "ENOENT") {
        throw new Error(formatFileNotFound(resolution));
      }
      throw new Error(formatFsError("read", resolution, err));
    });
    const form = new FormData();
    form.append("file", new Blob([buf]), bn(resolution.resolvedPath));
    return toResult(await client.request("POST", `/wiki/rest/api/content/${a.page_id}/child/attachment`, form, {
      isUpload: true, headers: { "X-Atlassian-Token": "no-check" },
    }));
  });

  reg("confluence_get_history", "Get page edit history", {
    type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"],
  }, async (a) => toResult(await client.request("GET", `/wiki/rest/api/content/${a.page_id}?expand=history`)));

  reg("confluence_get_version", "Get a specific page version", {
    type: "object",
    properties: { page_id: { type: "string" }, version_number: { type: "number" } },
    required: ["page_id", "version_number"],
  }, async (a) => toResult(await client.request("GET", `/wiki/rest/api/content/${a.page_id}/version/${a.version_number}`)));

  reg("confluence_get_page_analytics", "Get page analytics (history alias)", {
    type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"],
  }, async (a) => toResult(await client.request("GET", `/wiki/rest/api/content/${a.page_id}?expand=history`)));

  reg("confluence_get_comments", "Get comments on a page", {
    type: "object",
    properties: { page_id: { type: "string" }, start: { type: "number", default: 0 }, limit: { type: "number", default: 25 } },
    required: ["page_id"],
  }, async (a) => {
    return toResult(await client.request("GET", `/wiki/rest/api/content/${a.page_id}/child/comment?start=${a.start ?? 0}&limit=${a.limit ?? 25}&expand=body.storage`));
  });

  reg("confluence_add_comment", "Add a comment to a page", {
    type: "object",
    properties: { page_id: { type: "string" }, body: { type: "string" }, representation: { type: "string", default: "storage" } },
    required: ["page_id", "body"],
  }, async (a) => {
    const rep = a.representation || "storage";
    const payload = {
      type: "comment", container: { id: a.page_id, type: "page" },
      body: { [rep as string]: { value: a.body, representation: rep } },
    };
    return toResult(await client.request("POST", "/wiki/rest/api/content", payload));
  });
}

/** DRY helper — registers a tool with hidden:true + error boundary */
function reg(
  name: string, description: string, inputSchema: Record<string, unknown>,
  handler: (args: Record<string, any>) => Promise<any>,
): void {
  const def: LocalToolDefinition = { name, description, inputSchema, hidden: true };
  registerLocalTool(name, async (args) => {
    try { return await handler(args); } catch (e) { return toErrorResult(e); }
  }, def);
}
