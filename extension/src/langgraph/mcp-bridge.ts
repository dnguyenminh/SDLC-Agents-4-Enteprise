/**
 * McpBridge — KSA-210
 * Wraps McpServerManager for use by LangGraph nodes.
 * Provides timeout-aware tool invocation and availability checks.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { McpServerManager } from "../mcp-server-manager";
import { McpServerNotRunningError } from "../types";
import type { McpToolDefinition } from "./tool-registry";

/** Default tool call timeout (60s per TDD Section 3.3) */
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;

/** Timeout for tools/list request */
const LIST_TOOLS_TIMEOUT_MS = 10_000;

export class McpBridge {
  constructor(private readonly mcpManager: McpServerManager) {}

  /**
   * Invoke an MCP tool with timeout protection.
   * Delegates to McpServerManager.invokeTool().
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TOOL_TIMEOUT_MS
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new McpServerNotRunningError();
    }

    // Deep clone to prevent mutating LangGraph state (shallow copy { ...args } is not enough)
    const modifiedArgs = this.interceptRequestArgs(JSON.parse(JSON.stringify(args)));

    let timer: NodeJS.Timeout;
    // Race the tool call against a timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new McpToolTimeoutError(name, timeoutMs));
      }, timeoutMs);
      timer.unref?.();
    });

    try {
      const result = await Promise.race([
        this.mcpManager.invokeTool(name, modifiedArgs),
        timeoutPromise,
      ]);
      clearTimeout(timer!);
      return this.interceptResponse(result);
    } catch (err) {
      clearTimeout(timer!);
      throw err;
    }
  }

  private interceptRequestArgs(args: Record<string, unknown>): Record<string, unknown> {
    for (const key of Object.keys(args)) {
      if (key.endsWith("_as_path")) {
        const originalKey = key.replace("_as_path", "");
        const filePath = args[key] as string;
        try {
          if (fs.existsSync(filePath)) {
            args[originalKey] = fs.readFileSync(filePath, "base64");
          }
        } catch (e) {
          console.error(`[McpBridge] Failed to read ${filePath} for base64 translation:`, e);
        }
        delete args[key];
      } else if (typeof args[key] === "object" && args[key] !== null) {
        args[key] = this.interceptRequestArgs(args[key] as Record<string, unknown>);
      }
    }
    return args;
  }

  private interceptResponse(resultStr: string): string {
    try {
      const resultObj = JSON.parse(resultStr);
      if (resultObj && typeof resultObj === "object" && typeof resultObj._base64_file === "string") {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return "Proxy Error: Cannot save base64 file because workspace is undefined.";
        }
        
        try {
          const tmpDir = path.join(workspaceRoot, "documents", "tmp");
          if (!fs.existsSync(tmpDir)) { fs.mkdirSync(tmpDir, { recursive: true }); }
          
          const filename = resultObj._filename || `output_${Date.now()}.bin`;
          const outPath = path.join(tmpDir, filename);
          
          fs.writeFileSync(outPath, Buffer.from(resultObj._base64_file, "base64"));
          return `File saved successfully to: ${outPath}`;
        } catch (ioError: any) {
          return `Proxy Error: Failed to save base64 file to disk (${ioError.message || ioError})`;
        }
      }
    } catch (e) {
      // Not JSON or doesn't match schema
    }
    return resultStr;
  }

  /**
   * Fetch all available tools from MCP server via tools/list.
   * Returns array of tool definitions with name, description, and inputSchema.
   */
  async listTools(): Promise<McpToolDefinition[]> {
    if (!this.isAvailable()) {
      throw new McpServerNotRunningError();
    }

    const port = this.mcpManager.port;
    if (!port) {
      throw new McpServerNotRunningError();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIST_TOOLS_TIMEOUT_MS);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/list",
          params: {},
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        result?: { tools?: McpToolDefinition[] };
        error?: { code: number; message: string };
      };

      if (data.error) {
        throw new Error(`MCP error (${data.error.code}): ${data.error.message}`);
      }

      return data.result?.tools ?? [];
    } catch (err: unknown) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") {
        throw new McpToolTimeoutError("tools/list", LIST_TOOLS_TIMEOUT_MS);
      }
      throw err;
    }
  }

  /**
   * Check if MCP server is running and available for tool calls.
   */
  isAvailable(): boolean {
    return this.mcpManager.status === "running";
  }
}

/**
 * Error thrown when an MCP tool call exceeds its timeout.
 */
export class McpToolTimeoutError extends Error {
  constructor(toolName: string, timeoutMs: number) {
    super(`MCP tool '${toolName}' timed out after ${timeoutMs}ms`);
    this.name = "McpToolTimeoutError";
  }
}
