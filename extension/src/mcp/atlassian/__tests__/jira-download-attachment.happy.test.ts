/**
 * COMPLETE unit tests for the SA4E-229 jira_download_attachment tool handler
 * (split from jira-download-attachment.test.ts).
 *
 * Coverage:
 *  - Validation (missing args)
 *  - Happy path: download by attachment_id (fetches metadata first)
 *  - Happy path: download by attachment_url (skips metadata)
 *  - return_format: base64 (default) vs text
 *  - Metadata edge cases: missing content URL, missing filename/mimeType defaults
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard vscode so importing the atlassian HTTP client chain works outside the extension host.
vi.mock("vscode", () => ({
  workspace: { getConfiguration: () => ({ get: (_k: string, def?: unknown) => def }) },
}));

import { registerJiraAttachmentTools } from "../jira-attachment-tools";
import { executeLocalTool } from "../../../backend-local-tools";

interface ClientOpts {
  meta?: Record<string, unknown>;
  raw?: ArrayBuffer | null;
  rawError?: Error;
  metaError?: Error;
}

/** Build a fake AtlassianHttpClient that records calls and returns canned data. */
function makeClient(opts: ClientOpts = {}) {
  return {
    request: vi.fn(async (_m: string, _p: string) => {
      if (opts.metaError) throw opts.metaError;
      return { data: opts.meta ?? {} };
    }),
    requestRaw: vi.fn(async (_m: string, _p: string) => {
      if (opts.rawError) throw opts.rawError;
      return opts.raw ?? null;
    }),
  };
}

/** Register the tool with a fresh client before each test. */
function register(opts: ClientOpts = {}) {
  const client = makeClient(opts);
  registerJiraAttachmentTools(client as any);
  return client;
}

/** Extract the JSON payload from a tool result's text content. */
function parse(result: any): any {
  expect(result).toHaveProperty("content");
  expect(Array.isArray(result.content)).toBe(true);
  return JSON.parse(result.content[0].text);
}

/** Helper: wrap a Buffer as an ArrayBuffer slice (vitest's Buffer is a Node Buffer). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

beforeEach(() => {
  register();
});

describe("SA4E-229 jira_download_attachment — validation", () => {
  it("rejects when neither attachment_id nor attachment_url is provided", async () => {
    const res = (await executeLocalTool("jira_download_attachment", {})) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("VALIDATION_ERROR");
  });

  it("rejects when both attachment_id and attachment_url are empty strings", async () => {
    const res = (await executeLocalTool("jira_download_attachment", {
      attachment_id: "",
      attachment_url: "",
    })) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("VALIDATION_ERROR");
  });
});

describe("SA4E-229 jira_download_attachment — happy paths", () => {
  it("downloads by attachment_id: fetches metadata then content, returns base64 + metadata", async () => {
    const bytes = Buffer.from("hello SA4E-229");
    const client = register({
      meta: { content: "https://jira.example.com/secure/attachment/11263/file.pdf", mimeType: "application/pdf", filename: "file.pdf" },
      raw: toArrayBuffer(bytes),
    });

    const res = (await executeLocalTool("jira_download_attachment", { attachment_id: "11263" })) as any;
    expect(res.isError).toBe(false);
    const body = parse(res);
    expect(client.request).toHaveBeenCalledWith("GET", "/rest/api/2/attachment/11263");
    expect(client.requestRaw).toHaveBeenCalled();
    expect(body.content_base64).toBe(bytes.toString("base64"));
    expect(body.filename).toBe("file.pdf");
    expect(body.mime_type).toBe("application/pdf");
    expect(body.size_bytes).toBe(bytes.length);
  });

  it("downloads directly by attachment_url without fetching metadata", async () => {
    const bytes = Buffer.from("raw-url-content");
    const client = register({ raw: toArrayBuffer(bytes) });

    const res = (await executeLocalTool("jira_download_attachment", {
      attachment_url: "https://jira.example.com/secure/attachment/999/other.bin",
    })) as any;
    expect(res.isError).toBe(false);
    expect(client.request).not.toHaveBeenCalled(); // no metadata lookup
    expect(client.requestRaw).toHaveBeenCalled();
    expect(parse(res).content_base64).toBe(bytes.toString("base64"));
  });

  it("honors return_format='text': returns content_text and omits content_base64", async () => {
    const bytes = Buffer.from("plain text payload");
    register({ raw: toArrayBuffer(bytes) });

    const res = (await executeLocalTool("jira_download_attachment", {
      attachment_url: "https://jira.example.com/secure/attachment/1/a.txt",
      return_format: "text",
    })) as any;
    expect(res.isError).toBe(false);
    const body = parse(res);
    expect(body.content_text).toBe("plain text payload");
    expect(body.content_base64).toBeUndefined();
  });

  it("return_format='base64' (explicit) returns content_base64 and omits content_text", async () => {
    const bytes = Buffer.from("binary-bytes");
    register({ raw: toArrayBuffer(bytes) });

    const res = (await executeLocalTool("jira_download_attachment", {
      attachment_url: "https://jira.example.com/secure/attachment/1/a.bin",
      return_format: "base64",
    })) as any;
    const body = parse(res);
    expect(body.content_base64).toBe(bytes.toString("base64"));
    expect(body.content_text).toBeUndefined();
  });

  it("preserves multibyte UTF-8 content when decoded from base64", async () => {
    const original = "日本語 — SA4E-229 ✓";
    const bytes = Buffer.from(original, "utf-8");
    register({ raw: toArrayBuffer(bytes) });

    const res = (await executeLocalTool("jira_download_attachment", {
      attachment_url: "https://jira.example.com/secure/attachment/1/u.txt",
    })) as any;
    const body = parse(res);
    expect(Buffer.from(body.content_base64, "base64").toString("utf-8")).toBe(original);
    expect(body.size_bytes).toBe(bytes.length);
  });
});

describe("SA4E-229 jira_download_attachment — metadata edge cases", () => {
  it("returns NOT_FOUND when metadata has no content URL", async () => {
    register({ meta: { mimeType: "application/pdf", filename: "x.pdf" } }); // no `content`

    const res = (await executeLocalTool("jira_download_attachment", { attachment_id: "11263" })) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("NOT_FOUND");
  });

  it("defaults filename to 'attachment' when metadata omits it", async () => {
    const bytes = Buffer.from("x");
    register({
      meta: { content: "https://jira.example.com/secure/attachment/1/a.bin" }, // no filename/mimeType
      raw: toArrayBuffer(bytes),
    });

    const res = (await executeLocalTool("jira_download_attachment", { attachment_id: "1" })) as any;
    const body = parse(res);
    expect(body.filename).toBe("attachment");
    expect(body.mime_type).toBe("application/octet-stream");
  });
});
