import * as vscode from "vscode";
import { Base64ProxyService } from "../Base64ProxyService";
import type { McpSessionRoots } from "./session-roots";

export interface WrapperServerDeps {
  outputChannel: vscode.OutputChannel;
  base64Proxy: Base64ProxyService;
  restGetTools: () => Promise<any[]>;
  restCallTool: (name: string, args: Record<string, unknown>) => Promise<any>;
  /** Optional body-cap override in bytes (SA4E-363 §4) — tests inject a small
   *  cap to exercise byte-exact boundaries without allocating 64 MB. */
  maxBodyBytes?: number;
  /** SA4E-406 A6 — MCP session workspace binding (tests may inject a preloaded
   *  registry; production creates one per server instance). */
  sessionRoots?: McpSessionRoots;
}
