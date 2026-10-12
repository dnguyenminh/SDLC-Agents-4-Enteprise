/**
 * ToolProxy — Routes tool calls between local execution and remote backend.
 * Local tools (embed_images, etc.) run in-extension; everything else forwards to backend.
 */

import * as fs from "fs";
import { HttpClient, ToolResult } from "./HttpClient";
import { checkSymlinkGuard } from "../backend-local-tools";
import { resolveWorkspacePath, sanitizeLogText } from "../services/PathResolver";

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
    // file_path may be relative to the project — resolve it against the
    // primary workspace folder via the shared PathResolver (SA4E-356), NOT the
    // extension host's process.cwd() (which is the Kiro install dir).
    // Resolving against cwd caused ENOENT under the Kiro folder.
    const newArgs = { ...args };
    // SA4E-356 (SEC-08b, AD-22): the `path` alias is accepted and resolved
    // through the SAME helper (documented, no bypass).
    const rawChatPath = (args.file_path ?? args.path) as unknown;
    if (name === "mem_ingest_file" && typeof rawChatPath === "string") {
      const resolution = resolveWorkspacePath(rawChatPath);
      if (!resolution.ok) {
        // SEC-08a (AD-22): the `Wrapper Error:` prefix is MANDATORY — chat
        // ToolResult has no isError field, so consumers tell failure apart by
        // this marker. The CODE: prefix inside is kept verbatim (C-5).
        return { content: [{ type: "text", text: `Wrapper Error: ${resolution.message}` }] };
      }
      // I-7 symlink/junction guard before the pre-read.
      const guardError = checkSymlinkGuard(resolution, sanitizeLogText(rawChatPath));
      if (guardError) {
        return { content: [{ type: "text", text: `Wrapper Error: ${guardError}` }] };
      }
      try {
        newArgs.content = fs.readFileSync(resolution.resolvedPath, "utf-8");
        newArgs.file_path = resolution.resolvedPath; // send absolute path so the backend dedups/scopes consistently
      } catch (err: any) {
        return { content: [{ type: "text", text:
          `Wrapper Error: FS_ERROR: Failed to read ${sanitizeLogText(resolution.resolvedPath)} (resolved against ` +
          `${resolution.rootSource === "workspace" ? "workspace root " + sanitizeLogText(resolution.rootPath)
            : "process.cwd() fallback = " + sanitizeLogText(resolution.rootPath)}): ${sanitizeLogText(String(err?.message ?? err))}` }] };
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
