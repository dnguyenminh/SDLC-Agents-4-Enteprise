/**
 * SA4E-356 — Extension-host regression replay (STC E2E-API-01 REG-1, E2E-API-02 REG-2).
 *
 * CI scope (this file, vitest): the anti-regression proof that runs without a
 * live host or Jira access —
 *  - E2E-API-01: the original repro shape (relative jira_attach_file) can NEVER
 *    again resolve against process.cwd() (the Kiro install dir). In this
 *    environment it fails CLOSED (PATH_NO_WORKSPACE) with ZERO HTTP calls;
 *    on a real host with a workspace open the same call succeeds first try.
 *  - E2E-API-02: the absolute-path control keeps working byte-for-byte (N-4).
 *
 * MANUAL CLOSE-GATE (QA on a real Kiro host with workspace
 * C:\projects\kiro\SDLC-Agents-4-Enterprise open — ticket does NOT close
 * without this):
 *  1. Call jira_attach_file(issue_key="SA4E-355",
 *     file_path="documents/SA4E-355/FSD.md") — relative, no absolute fallback.
 *  2. Expect success on the FIRST attempt; verify the attachment on the issue;
 *     record the attachment ID as evidence.
 *  3. Extend to the remaining SA4E-355 docs; count tool calls (N-6: ≤2/file).
 *  4. REG-2: repeat one call with the absolute path (both `C:\` and `c:\`
 *     forms) — success proves backward compatibility.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { executeLocalTool } from "../backend-local-tools";
import { registerJiraAttachmentTools } from "../mcp/atlassian/jira-attachment-tools";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-356-reg-"));

function mockClient() {
  return {
    request: vi.fn(async () => ({ status: 200, data: { id: "reg-1" } })),
  } as any;
}

beforeAll(() => {
  registerJiraAttachmentTools(mockClient());
  fs.writeFileSync(path.join(TMP, "FSD.md"), "# FSD replay fixture", "utf-8");
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("E2E-API-01 REG-1 replay (STC E2E-API-01)", () => {
  // STC: E2E-API-01 — the Kiro-dir ENOENT is gone by construction: a relative
  // path is never resolved against process.cwd() anymore (BR-06b rejects it
  // when no workspace is open; the workspace root owns it otherwise).
  it("relative repro never touches process.cwd() or the network on fallback", async () => {
    const client = mockClient();
    registerJiraAttachmentTools(client);
    const result: any = await executeLocalTool("jira_attach_file", {
      issue_key: "SA4E-355",
      file_path: "documents/SA4E-355/FSD.md",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("PATH_NO_WORKSPACE:");
    // The old root cause would have produced ENOENT under Programs\Kiro AND
    // (for absolute-shaped inputs) an upload attempt — neither happens here.
    expect(result.content[0].text).not.toMatch(/Programs\\Kiro|AppData\\Local\\Programs/i);
    expect(client.request).not.toHaveBeenCalled();
  });
});

describe("E2E-API-02 REG-2 absolute control (STC E2E-API-02, N-4)", () => {
  // STC: E2E-API-02 — absolute passthrough keeps working (R-5, N-4).
  it("absolute attach succeeds with the resolved location", async () => {
    const client = mockClient();
    registerJiraAttachmentTools(client);
    const abs = path.join(TMP, "FSD.md");
    const result: any = await executeLocalTool("jira_attach_file", {
      issue_key: "SA4E-355",
      file_path: abs,
    });
    expect(result.isError).toBe(false);
    expect(client.request).toHaveBeenCalledTimes(1);
    const file = (client.request.mock.calls[0][2] as FormData).get("file") as File;
    expect(file.name).toBe("FSD.md");
    expect(await file.text()).toBe("# FSD replay fixture");
  });

  // STC: E2E-API-02 step 2 — casing robustness at tool level (R-1, win32).
  it("absolute attach tolerates drive-letter casing on win32", async () => {
    if (process.platform !== "win32") return;
    const client = mockClient();
    registerJiraAttachmentTools(client);
    const abs = path.join(TMP, "FSD.md");
    const flipped =
      abs[0] === abs[0].toUpperCase() ? abs[0].toLowerCase() + abs.slice(1) : abs[0].toUpperCase() + abs.slice(1);
    const result: any = await executeLocalTool("jira_attach_file", {
      issue_key: "SA4E-355",
      file_path: flipped,
    });
    expect(result.isError).toBe(false);
    expect(client.request).toHaveBeenCalledTimes(1);
  });
});
