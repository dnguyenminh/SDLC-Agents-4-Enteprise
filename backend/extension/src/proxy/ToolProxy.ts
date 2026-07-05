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
    } catch { /* non-fatal */ }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this.localTools.has(name)) { return this.executeLocal(name, args); }
    
    // Wrapper: Read local file content before sending to remote backend
    const newArgs = { ...args };
    if (name === "mem_ingest_file" && typeof args.file_path === "string") {
      try {
        newArgs.content = fs.readFileSync(args.file_path, "utf-8");
      } catch (err: any) {
        return { content: [{ type: "text", text: `Wrapper Error: Cannot read local file ${args.file_path}: ${err.message}` }] };
      }
    }
    
    return this.httpClient.callTool(name, newArgs);
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
