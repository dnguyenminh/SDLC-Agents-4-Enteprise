/**
 * COMPLETE unit tests for the SA4E-229 jira_download_attachment tool handler
 * (split from jira-download-attachment.test.ts).
 *
 * Coverage:
 *  - URL/path handling: query strings preserved for both id- and url-based flows
 *  - Error matrix: 403, 404, empty content, generic network error,
 *    and 403/404 raised during the metadata lookup step
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

describe("SA4E-229 jira_download_attachment — URL/path handling", () => {
  it("preserves query string from attachment_url into the raw request path", async () => {
    const bytes = Buffer.from("q");
    const client = register({ raw: toArrayBuffer(bytes) });

    await executeLocalTool("jira_download_attachment", {
      attachment_url: "https://jira.example.com/secure/attachment/1/a.bin?version=3&t=9",
    });
    expect(client.requestRaw).toHaveBeenCalledWith("GET", "/secure/attachment/1/a.bin?version=3&t=9");
  });

  it("preserves query string from metadata content URL into the raw request path", async () => {
    const bytes = Buffer.from("q");
    const client = register({
      meta: { content: "https://jira.example.com/secure/attachment/1/a.bin?version=2" },
      raw: toArrayBuffer(bytes),
    });

    await executeLocalTool("jira_download_attachment", { attachment_id: "1" });
    expect(client.requestRaw).toHaveBeenCalledWith("GET", "/secure/attachment/1/a.bin?version=2");
  });
});

describe("SA4E-229 jira_download_attachment — error matrix", () => {
  it("FORBIDDEN when content download returns 403", async () => {
    register({ rawError: new Error("HTTP 403 Forbidden") });
    const res = (await executeLocalTool("jira_download_attachment", { attachment_url: "https://x/secure/attachment/1/a" })) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("FORBIDDEN");
  });

  it("NOT_FOUND when content download returns 404", async () => {
    register({ rawError: new Error("HTTP 404 Not Found") });
    const res = (await executeLocalTool("jira_download_attachment", { attachment_url: "https://x/secure/attachment/1/a" })) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("NOT_FOUND");
  });

  it("NOT_FOUND when content download yields no bytes", async () => {
    register({ raw: null });
    const res = (await executeLocalTool("jira_download_attachment", { attachment_url: "https://x/secure/attachment/1/a" })) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("NOT_FOUND");
  });

  it("passes through a generic network error (not classified as 403/404)", async () => {
    register({ rawError: new Error("ECONNRESET") });
    const res = (await executeLocalTool("jira_download_attachment", { attachment_url: "https://x/secure/attachment/1/a" })) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("ECONNRESET");
  });

  it("FORBIDDEN when the metadata lookup itself returns 403", async () => {
    register({ metaError: new Error("HTTP 403 Forbidden") });
    const res = (await executeLocalTool("jira_download_attachment", { attachment_id: "1" })) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("FORBIDDEN");
  });

  it("NOT_FOUND when the metadata lookup itself returns 404", async () => {
    register({ metaError: new Error("HTTP 404 Not Found") });
    const res = (await executeLocalTool("jira_download_attachment", { attachment_id: "1" })) as any;
    expect(res.isError).toBe(true);
    expect(parse(res).error).toContain("NOT_FOUND");
  });
});
