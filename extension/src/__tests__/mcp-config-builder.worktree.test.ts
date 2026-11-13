/**
 * SA4E-393 Addendum 5 (E2.3) — resolveConfig tells the backend about ALL folders open in
 * this instance via MCP_OPEN_WORKSPACE_FOLDERS (folder[0] is already CODE_INTEL_WORKSPACE).
 */
import { afterEach, describe, expect, it } from "vitest";
import * as path from "path";
import * as vscode from "vscode";
import { resolveConfig } from "../mcp-config-builder";

const variant: any = { id: "v", config: { command: "node", args: ["${mcpServersDir}/x.js"] } };
const original = (vscode.workspace as any).workspaceFolders;
const folder = (p: string, index: number) => ({ uri: { fsPath: p }, name: `f${index}`, index });
afterEach(() => { (vscode.workspace as any).workspaceFolders = original; });

describe("resolveConfig MCP_OPEN_WORKSPACE_FOLDERS", () => {
  it("lists every open folder joined by path.delimiter", () => {
    const a = path.resolve("/sa4e393/a"), b = path.resolve("/sa4e393/b");
    (vscode.workspace as any).workspaceFolders = [folder(a, 0), folder(b, 1)];
    const env = (resolveConfig(variant, a) as any).env;
    expect(env.MCP_OPEN_WORKSPACE_FOLDERS).toBe([a, b].join(path.delimiter));
    expect(env.CODE_INTEL_WORKSPACE).toBe(a); // unchanged
    expect(env.CODE_INTEL_VIEWER_PORT).toBe("3200");
  });

  it("omits the variable when no folders are open and skips entries containing the delimiter", () => {
    (vscode.workspace as any).workspaceFolders = undefined;
    expect((resolveConfig(variant, "/r") as any).env).not.toHaveProperty("MCP_OPEN_WORKSPACE_FOLDERS");
    (vscode.workspace as any).workspaceFolders = [folder(`/bad${path.delimiter}dir`, 0), folder(path.resolve("/ok"), 1)];
    expect((resolveConfig(variant, "/r") as any).env.MCP_OPEN_WORKSPACE_FOLDERS).toBe(path.resolve("/ok"));
  });
});
