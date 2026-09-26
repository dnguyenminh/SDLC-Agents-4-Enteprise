/**
 * ToolProxy — Routes tool calls between local execution and remote backend.
 * Local tools (embed_images, etc.) run in-extension; everything else forwards to backend.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { HttpClient, ToolResult } from "./HttpClient";

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class ToolProxy {
  private localTools = new Set<string>();
  private toolRegistry: Map<string, ToolDefinition> = new Map();

  constructor(private readonly httpClient: HttpClient) {}

  async refreshTools(): Promise<void> {
    try {
      const tools = await this.httpClient.get<ToolDefinition[]>("/mcp/tools/list");
      this.toolRegistry.clear();
      for (const tool of tools) { this.toolRegistry.set(tool.name, tool); }
    } catch (err) {
      // Non-fatal — keep existing registry, but log so stale registry is visible
      console.warn(`[ToolProxy] refreshTools failed, keeping existing registry: ${(err as Error).message}`);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this.localTools.has(name)) { return this.executeLocal(name, args); }

    // Wrapper: Read local file content before sending to remote backend.
    // file_path may be relative to the project — resolve it against the VS Code
    // workspace root, NOT the extension host's process.cwd() (which is the Kiro
    // install dir). Resolving against cwd caused ENOENT under the Kiro folder.
    const newArgs = { ...args };
    if (name === "mem_ingest_file" && typeof args.file_path === "string") {
      const resolved = this.resolveWorkspacePath(args.file_path);
      try {
        newArgs.content = fs.readFileSync(resolved, "utf-8");
        newArgs.file_path = resolved; // send absolute path so the backend dedups/scopes consistently
      } catch (err: any) {
        return { content: [{ type: "text", text: `Wrapper Error: Cannot read local file ${resolved}: ${err.message}` }] };
      }
    }

    return this.httpClient.callTool(name, newArgs);
  }

  /**
   * Resolve a possibly-relative file path against the current VS Code workspace root.
   * Absolute paths are returned unchanged. Falls back to the raw path when no
   * workspace folder is open (better an explicit ENOENT than a wrong cwd resolve).
   * @param filePath Absolute or workspace-relative file path from the tool call.
   * @returns An absolute path suitable for fs access.
   */
  private resolveWorkspacePath(filePath: string): string {
    if (path.isAbsolute(filePath)) { return filePath; }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? path.resolve(root, filePath) : filePath;
  }

  getAvailableTools(): ToolDefinition[] { return [...this.toolRegistry.values()]; }

  async invokeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.callTool(name, args);
    if (result.content && result.content.length > 0) { return result.content.map((c) => c.text).join("\n"); }
    return "";
  }

  private async executeLocal(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    return { content: [{ type: "text", text: "Unknown local tool: " + name }] };
  }
}
