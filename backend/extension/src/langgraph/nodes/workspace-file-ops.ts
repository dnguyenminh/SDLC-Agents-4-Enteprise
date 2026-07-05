/**
 * Workspace File Operations — extracted from BaseNode (KSA-242)
 * Provides file read/write/export utilities for pipeline nodes.
 */

import { debugError } from "../../debug-logger";
import type { McpBridge } from "../mcp-bridge";

/** Extended timeout for DOCX export and draw.io PNG export (90s) */
const EXPORT_TIMEOUT_MS = 90_000;

/** Per-tool call timeout (60s) */
const TOOL_CALL_TIMEOUT_MS = 60_000;

export async function readWorkspaceFile(relativePath: string): Promise<string | null> {
  try {
    const vscode = require("vscode");
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return null;
    const path = require("path");
    const fullPath = path.join(workspaceRoot, relativePath);
    const uri = vscode.Uri.file(fullPath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString("utf-8");
  } catch {
    return null;
  }
}

export async function writeWorkspaceFile(
  relativePath: string,
  content: string,
  mcpBridge: McpBridge,
  preHookFn?: () => Promise<string[]>,
  kbSearchFn?: (query: string) => Promise<string>,
  fileHookFn?: (path: string) => Promise<void>
): Promise<boolean> {
  if (preHookFn) {
    const instructions = await preHookFn();
    if (relativePath.endsWith(".drawio") && kbSearchFn) {
      for (const instruction of instructions) {
        if (instruction.includes("drawio") && instruction.includes("mem_search")) {
          await kbSearchFn("drawio procedure styles edges containers");
        }
      }
    }
  }

  try {
    const result = await mcpBridge.callTool("stream_write_file", {
      file_path: relativePath, content, mode: "write",
    }, TOOL_CALL_TIMEOUT_MS);
    if (fileHookFn) await fileHookFn(relativePath);
    return !result.includes("error");
  } catch {
    return await writeViaVscodeApi(relativePath, content);
  }
}

async function writeViaVscodeApi(relativePath: string, content: string): Promise<boolean> {
  try {
    const vscode = require("vscode");
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return false;
    const path = require("path");
    const fullPath = path.join(workspaceRoot, relativePath);
    const uri = vscode.Uri.file(fullPath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));
    return true;
  } catch {
    return false;
  }
}

export async function appendWorkspaceFile(
  relativePath: string, content: string, mcpBridge: McpBridge
): Promise<boolean> {
  try {
    const result = await mcpBridge.callTool("stream_write_file", {
      file_path: relativePath, content, mode: "append",
    }, TOOL_CALL_TIMEOUT_MS);
    return !result.includes("error");
  } catch {
    return false;
  }
}

export async function exportDocx(
  mdRelativePath: string, docxFileName: string, mcpBridge: McpBridge
): Promise<string | null> {
  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) return null;
    const path = require("path");
    const absoluteMdPath = path.join(workspaceRoot, mdRelativePath);
    const embeddedPath = absoluteMdPath.replace(/\.md$/, "-embedded.md");

    await mcpBridge.callTool("execute_dynamic_tool", {
      tool_name: "embed_images",
      arguments: { file_path: absoluteMdPath, output_path: embeddedPath },
    }, EXPORT_TIMEOUT_MS);

    const result = await mcpBridge.callTool("execute_dynamic_tool", {
      tool_name: "export_docx",
      arguments: { file_path: embeddedPath, file_name: docxFileName },
    }, EXPORT_TIMEOUT_MS);

    await cleanupEmbeddedFile(embeddedPath);
    return result || `${docxFileName}.docx`;
  } catch (err) {
    debugError(`[WorkspaceFileOps] DOCX export failed for ${mdRelativePath}`, err as Error);
    return null;
  }
}

export async function exportDrawioPng(
  drawioRelativePath: string, mcpBridge: McpBridge
): Promise<boolean> {
  try {
    const result = await mcpBridge.callTool("drawio_export_png", {
      file_path: drawioRelativePath,
    }, EXPORT_TIMEOUT_MS);
    return !result.includes("error") && !result.includes("Error");
  } catch (err) {
    debugError(`[WorkspaceFileOps] draw.io export failed`, err as Error);
    return false;
  }
}

export function getWorkspaceRoot(): string | null {
  try {
    const vscode = require("vscode");
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  } catch {
    return null;
  }
}

export async function readCodeIntelligence(moduleName?: string): Promise<string | null> {
  const projectStructure = await readWorkspaceFile(
    ".analysis/code-intelligence/project-structure.md"
  );
  if (!moduleName) return projectStructure;
  const moduleAnalysis = await readWorkspaceFile(
    `.analysis/code-intelligence/modules/${moduleName}.md`
  );
  return [projectStructure, moduleAnalysis].filter(Boolean).join("\n\n---\n\n");
}

async function cleanupEmbeddedFile(embeddedPath: string): Promise<void> {
  try {
    const vscode = require("vscode");
    await vscode.workspace.fs.delete(vscode.Uri.file(embeddedPath));
  } catch { /* ignore cleanup failure */ }
}
