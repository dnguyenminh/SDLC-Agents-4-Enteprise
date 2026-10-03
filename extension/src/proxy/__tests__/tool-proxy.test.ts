/**
 * Unit tests for ToolProxy — tool registry refresh, remote forwarding, local wrappers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ToolProxy } from "../ToolProxy";

vi.mock("../extension", () => ({ getProjectId: vi.fn(() => ""), setProjectId: vi.fn() }));

function makeHttpClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    callTool: vi.fn(async () => ({ content: [{ type: "text", text: "backend result" }] })),
    baseUrl: "http://backend",
  };
}

describe("ToolProxy", () => {
  const httpClient = makeHttpClient();
  const proxy = new ToolProxy(httpClient as never);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshTools populates the tool registry", async () => {
    httpClient.get.mockResolvedValue([
      { name: "code_intel_upload" },
      { name: "embed_images", description: "embeds" },
    ]);
    await proxy.refreshTools();
    expect(proxy.getAvailableTools().map((t) => t.name).sort()).toEqual([
      "code_intel_upload",
      "embed_images",
    ]);
  });

  it("refreshTools keeps the existing registry and warns on failure", async () => {
    httpClient.get.mockResolvedValue([{ name: "existing_tool" }]);
    await proxy.refreshTools();
    httpClient.get.mockRejectedValue(new Error("backend down"));
    await proxy.refreshTools();
    expect(proxy.getAvailableTools().map((t) => t.name)).toContain("existing_tool");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("refreshTools failed")
    );
  });

  it("callTool forwards non-local tools to the backend client", async () => {
    const result = await proxy.callTool("embed_images", { image: "a.png" });
    expect(result.content[0].text).toBe("backend result");
    expect(httpClient.callTool).toHaveBeenCalledWith("embed_images", { image: "a.png" });
  });

  it("callTool adds file content for mem_ingest_file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolproxy-"));
    const filePath = path.join(dir, "notes.md");
    fs.writeFileSync(filePath, "hello from file", "utf-8");
    await proxy.callTool("mem_ingest_file", { file_path: filePath });
    expect(httpClient.callTool).toHaveBeenCalledWith(
      "mem_ingest_file",
      expect.objectContaining({ file_path: filePath, content: "hello from file" })
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("callTool resolves relative mem_ingest_file against the workspace root (D2 regression)", async () => {
    const vscode = await import("vscode");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toolproxy-rel-"));
    const prevFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [
      { uri: { fsPath: dir, path: dir }, name: "ws", index: 0 },
    ];
    fs.writeFileSync(path.join(dir, "rel-notes.md"), "relative content", "utf-8");
    try {
      await proxy.callTool("mem_ingest_file", { file_path: "rel-notes.md" });
      expect(httpClient.callTool).toHaveBeenCalledWith(
        "mem_ingest_file",
        expect.objectContaining({
          file_path: path.resolve(dir, "rel-notes.md"),
          content: "relative content",
        })
      );
    } finally {
      (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = prevFolders;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("callTool wraps unreadable files in an error payload", async () => {
    const result = await proxy.callTool("mem_ingest_file", { file_path: "C:/nothing/here.ts" });
    expect(result.content[0].text).toContain("Cannot read local file");
    expect(httpClient.callTool).not.toHaveBeenCalled();
  });

  it("callTool handles registered local tools in-extension", async () => {
    const hacked = proxy as unknown as { localTools: Set<string> };
    hacked.localTools.add("embed_images");
    const result = await proxy.callTool("embed_images", {});
    expect(result.content[0].text).toContain("Unknown local tool");
    expect(httpClient.callTool).not.toHaveBeenCalled();
  });

  it("invokeTool joins all content blocks with newlines", async () => {
    httpClient.callTool.mockResolvedValue({
      content: [{ type: "text", text: "line1" }, { type: "text", text: "line2" }],
    });
    const output = await proxy.invokeTool("some_tool", {});
    expect(output).toBe("line1\nline2");
  });

  it("invokeTool returns empty string when no content", async () => {
    httpClient.callTool.mockResolvedValue({ content: [] });
    const output = await proxy.invokeTool("some_tool", {});
    expect(output).toBe("");
  });
});