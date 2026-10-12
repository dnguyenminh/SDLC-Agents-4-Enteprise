/**
 * SA4E-356 — Integration tests for jira_attach_file / confluence_add_attachment
 * (STC IT-03, IT-04, IT-07, IT-08). Atlassian HTTP is mocked; fs is real.
 *
 * NOTE (vitest env): handlers resolve through the default provider, which
 * always yields cwd_fallback here (require-mock note in
 * backend-local-tools TC-05). Tests therefore use ABSOLUTE tmpdir paths for
 * the happy path; workspace-relative resolution is covered in
 * services/__tests__/path-resolver.test.ts. Resolve-fail-before-HTTP (I-3)
 * and Format 1/2 envelopes hold in every mode and are asserted here.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { executeLocalTool } from "../../../backend-local-tools";
import { registerJiraAttachmentTools } from "../jira-attachment-tools";
import { registerConfluenceContentTools } from "../confluence-content-tools";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-356-attach-"));

function mockClient() {
  return {
    request: vi.fn(async (_method: string, _url: string, _body?: unknown, _opts?: unknown) => ({
      status: 200,
      data: { id: "10001" },
    })),
  } as any;
}

beforeAll(() => {
  fs.mkdirSync(path.join(TMP, "documents", "SA4E-355"), { recursive: true });
  fs.writeFileSync(path.join(TMP, "documents", "SA4E-355", "FSD.md"), "# FSD fixture", "utf-8");
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("jira_attach_file (STC IT-03)", () => {
  // STC: IT-03 — repro shape: buffer read from the resolved path (never the
  // Kiro install dir), uploaded under basename(resolvedPath).
  it("reads from the resolved path and uploads with the basename", async () => {
    const client = mockClient();
    registerJiraAttachmentTools(client);
    const abs = path.join(TMP, "documents", "SA4E-355", "FSD.md");
    const result: any = await executeLocalTool("jira_attach_file", {
      issue_key: "SA4E-355",
      file_path: abs,
    });
    expect(result.isError).toBe(false);
    expect(client.request).toHaveBeenCalledTimes(1);
    const [method, url, form] = client.request.mock.calls[0];
    expect(method).toBe("POST");
    expect(url).toContain("/rest/api/2/issue/SA4E-355/attachments");
    const file = (form as FormData).get("file") as File;
    expect(file.name).toBe("FSD.md");
    expect(await file.text()).toBe("# FSD fixture");
  });

  // STC: IT-08 — resolve fail returns BEFORE any HTTP (I-3, C-6).
  it("returns PATH_NO_WORKSPACE before HTTP for relative paths on fallback", async () => {
    const client = mockClient();
    registerJiraAttachmentTools(client);
    const result: any = await executeLocalTool("jira_attach_file", {
      issue_key: "SA4E-355",
      file_path: "documents/SA4E-355/FSD.md",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("PATH_NO_WORKSPACE:");
    expect(client.request).not.toHaveBeenCalled();
  });

  // STC: IT-08 — NUL input never reaches fs or HTTP (C-1, C-4).
  it("returns PATH_INVALID before HTTP for NUL paths", async () => {
    const client = mockClient();
    registerJiraAttachmentTools(client);
    const result: any = await executeLocalTool("jira_attach_file", {
      issue_key: "SA4E-355",
      file_path: "a\0b.md",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("PATH_INVALID:");
    expect(client.request).not.toHaveBeenCalled();
  });

  // STC: IT-07 — ENOENT after correct resolve yields Format 1 (code + path).
  // NOTE: toErrorResult JSON-escapes the message (backslashes doubled), so
  // asserts use the code + basename + Format-1 markers, not the raw path.
  it("wraps a missing file as FILE_NOT_FOUND with the resolved path", async () => {
    const client = mockClient();
    registerJiraAttachmentTools(client);
    const missing = path.join(TMP, "nope-missing.md");
    const result: any = await executeLocalTool("jira_attach_file", {
      issue_key: "SA4E-355",
      file_path: missing,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("FILE_NOT_FOUND:");
    expect(result.content[0].text).toContain("nope-missing.md");
    expect(result.content[0].text).toContain("Resolved against");
    expect(client.request).not.toHaveBeenCalled();
  });
});

describe("confluence_add_attachment (STC IT-04)", () => {
  // STC: IT-04 — same-pattern fix: buffer from the resolved path.
  it("reads from the resolved path and uploads with the basename", async () => {
    const client = mockClient();
    registerConfluenceContentTools(client);
    const abs = path.join(TMP, "documents", "SA4E-355", "FSD.md");
    const result: any = await executeLocalTool("confluence_add_attachment", {
      page_id: "12345",
      file_path: abs,
    });
    expect(result.isError).toBe(false);
    expect(client.request).toHaveBeenCalledTimes(1);
    const [method, url, form] = client.request.mock.calls[0];
    expect(method).toBe("POST");
    expect(url).toContain("/wiki/rest/api/content/12345/child/attachment");
    const file = (form as FormData).get("file") as File;
    expect(file.name).toBe("FSD.md");
  });

  // STC: IT-08 — resolve fail returns before FormData/HTTP (I-3, C-5 verbatim).
  it("returns before FormData/HTTP for escape-shaped input", async () => {
    const client = mockClient();
    registerConfluenceContentTools(client);
    const result: any = await executeLocalTool("confluence_add_attachment", {
      page_id: "12345",
      // Relative on fallback → PATH_NO_WORKSPACE (fail-closed before HTTP).
      file_path: "../../../evil.txt",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("PATH_NO_WORKSPACE:");
    expect(client.request).not.toHaveBeenCalled();
  });

  // STC: IT-07 — Format 1 on missing file (basename assert — see jira note).
  it("wraps a missing file as FILE_NOT_FOUND with the resolved path", async () => {
    const client = mockClient();
    registerConfluenceContentTools(client);
    const missing = path.join(TMP, "conf-missing.md");
    const result: any = await executeLocalTool("confluence_add_attachment", {
      page_id: "12345",
      file_path: missing,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("FILE_NOT_FOUND:");
    expect(result.content[0].text).toContain("conf-missing.md");
    expect(result.content[0].text).toContain("Resolved against");
    expect(client.request).not.toHaveBeenCalled();
  });
});
