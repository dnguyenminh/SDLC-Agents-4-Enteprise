/**
 * Server management, JSON-RPC protocol, and error types.
 */
import * as vscode from "vscode";

export type ServerStatus = "starting" | "running" | "crashed" | "stopped";

export interface IServerManager {
  readonly status: ServerStatus;
  readonly pid: number | null;
  readonly port: number | null;
  spawn(): Promise<void>;
  kill(): Promise<void>;
  restart(): Promise<void>;
  invokeTool(name: string, args: Record<string, unknown>): Promise<string>;
  onStatusChange: vscode.Event<ServerStatus>;
}

export interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: "tools/call";
  params: { name: string; arguments: Record<string, unknown> };
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: { content: Array<{ type: "text"; text: string }> };
  error?: { code: number; message: string; data?: unknown };
}

export class McpServerNotRunningError extends Error {
  constructor() { super("MCP Server is not running."); this.name = "McpServerNotRunningError"; }
}

export class McpTimeoutError extends Error {
  constructor(toolName: string, timeoutMs: number) {
    super(`MCP tool '${toolName}' timed out after ${timeoutMs}ms.`);
    this.name = "McpTimeoutError";
  }
}

export class McpSpawnError extends Error {
  constructor(reason: string) { super(`MCP server failed to start: ${reason}`); this.name = "McpSpawnError"; }
}

export class McpBundleMissingError extends Error {
  constructor() { super("MCP server bundle not found. Reinstall extension."); this.name = "McpBundleMissingError"; }
}

export interface TreeSection { label: string; icon: string; children: TreeItem[]; }
export interface TreeItem { label: string; icon: string; command?: string; description?: string; }

export const SERVER_CONSTANTS = {
  DEFAULT_PORT: 9180,
  MAX_RESTARTS: 3,
  BACKOFF_MS: [5000, 15000, 30000] as const,
  STARTUP_TIMEOUT_MS: 5000,
  REQUEST_TIMEOUT_MS: 30000,
  KILL_TIMEOUT_MS: 5000,
  DASHBOARD_REFRESH_MS: 60000,
  PANEL_FALLBACK_REFRESH_MS: 300000,
  GRAPH_MAX_NODES: 500,
};

export async function checkLlmAvailability(
  secrets?: vscode.SecretStorage, configKey: string = "kiroSdlc"
): Promise<boolean> {
  const config = vscode.workspace.getConfiguration(configKey);
  const providerType = config.get<string>("llmProvider", "anthropic");
  switch (providerType) {
    case "ollama":
      try { await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) }); return true; }
      catch { return false; }
    case "openai": {
      const key = secrets ? (await secrets.get("kiroSdlc.openaiApiKey")) : undefined;
      if (!key) return false;
      try { await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2000) }); return true; }
      catch { return false; }
    }
    case "anthropic":
    default: {
      const key = secrets ? (await secrets.get("kiroSdlc.anthropicApiKey")) : undefined;
      if (!key) return false;
      try { await fetch("https://api.anthropic.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2000) }); return true; }
      catch { return false; }
    }
  }
}

export function mapServerStatusToWebview(status: ServerStatus): "connected" | "disconnected" | "failed" {
  if (status === "running") return "connected";
  if (status === "crashed") return "failed";
  return "disconnected";
}
