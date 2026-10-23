/**
 * Base64ProxyService — Schema-driven auto-detection and transparent
 * file ↔ base64 proxy for backend tool communication.
 *
 * Architecture: LLM → Extension(9181) → Backend(48721)
 * - Scans tool schemas from backend to auto-populate proxy Sets
 * - Rewrites schemas for LLM (hide content_base64, show file_path)
 * - Intercepts tool calls to proxy file_path ↔ content_base64
 * - Handles execute_dynamic_tool nested argument unwrapping
 *
 * SRP: This service ONLY handles base64 proxy logic.
 *
 * SA4E-356: path resolution is fully delegated to PathResolver
 * (single source of truth). The constructor accepts a plain string (legacy
 * callers/tests) or a live WorkspaceRootProvider (production wiring in
 * RemoteBackendClient — UC-01 AF-2, no stale root).
 *
 * Schema rewriting and dynamic-tool helpers live in ./Base64ProxyService/*.
 */
import * as fs from "fs";
import { checkSymlinkGuard } from "../backend-local-tools";
import {
  resolveWorkspacePath,
  sanitizeLogText,
  PathResolverError,
  type PathResolutionOk,
  type WorkspaceRootProvider,
} from "./PathResolver";
import type { ToolSchema } from "./Base64ProxyService/types";
import {
  hasBase64InputParam,
  hasBase64Output,
  rewriteSingleSchema,
} from "./Base64ProxyService/schema-rewrite";
import { unwrapDynamicTool, wrapDynamicTool } from "./Base64ProxyService/dynamic-tool";
import { proxyToolOutput } from "./Base64ProxyService/output-proxy";

export type { ToolSchema } from "./Base64ProxyService/types";

/** Maximum proxy pre-read file size (N-9, SEC-07 — SA policy). */
export const PROXY_PRE_READ_MAX_BYTES = 25 * 1024 * 1024;

export class Base64ProxyService {
  private base64InputTools = new Set<string>();
  private base64OutputTools = new Set<string>();

  /**
   * @param workspaceRoot Project/workspace root used to resolve relative
   *   file paths — either a captured string (backward compatible) or a live
   *   provider (production: reads vscode.workspace per call). Without a root,
   *   relative paths fail with PATH_NO_WORKSPACE and absolute paths pass
   *   through (PathResolver BR-06b / DISC-1).
   */
  constructor(private readonly workspaceRoot?: string | WorkspaceRootProvider) {}

  /** Scan tool list from backend and auto-detect proxy requirements (replaces the known set). */
  detectFromToolList(tools: ToolSchema[]): void {
    this.base64InputTools.clear();
    this.base64OutputTools.clear();
    this.registerTools(tools);
  }

  /**
   * Add proxy requirements discovered later (find_tools catalog) without
   * dropping the tools/list set. Catalog entries carry `schema`; tools/list
   * entries carry `inputSchema` — detection handles both.
   */
  registerTools(tools: ToolSchema[]): void {
    for (const tool of tools) {
      if (hasBase64InputParam(tool)) {
        this.base64InputTools.add(tool.name);
      }
      if (hasBase64Output(tool)) {
        this.base64OutputTools.add(tool.name);
      }
    }
  }

  /** Check if a tool requires input proxy (file_path → base64). */
  needsInputProxy(toolName: string): boolean {
    return this.base64InputTools.has(toolName);
  }

  /** Check if a tool returns output_base64 in response. */
  needsOutputProxy(toolName: string): boolean {
    return this.base64OutputTools.has(toolName);
  }

  /** Rewrite tool schemas for LLM visibility (hide content_base64, add output_path). */
  rewriteSchemasForLlm(tools: ToolSchema[]): ToolSchema[] {
    return tools.map((tool) => rewriteSingleSchema(
      tool,
      this.base64InputTools.has(tool.name),
      this.base64OutputTools.has(tool.name),
    ));
  }

  /** Proxy input: read file_path → inject content_base64 into args. */
  proxyInput(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    if (!this.base64InputTools.has(toolName)) return args;
    const filePath = args.file_path as string | undefined;
    if (!filePath || args.content_base64) return args;
    const newArgs = { ...args };
    // resolvePath throws PathResolverError on resolution failure —
    // WrapperServer.routeToolCall converts it to a tool error result (§5.6).
    const resolution = this.resolvePathOrThrow(filePath);
    const resolvedPath = resolution.resolvedPath;
    // STC IT-05 step 3: the backend receives the RESOLVED ABSOLUTE path (same
    // contract as the chat path — backend dedup/scoping keys on absolute path).
    newArgs.file_path = resolvedPath;
    // I-7 symlink/junction guard before the pre-read.
    const guardError = checkSymlinkGuard(resolution, sanitizeLogText(String(filePath)));
    if (guardError) throw new PathResolverError(guardError);
    // N-9 (SEC-07, AD-21): pre-read cap BEFORE loading bytes (base64 +33% OOM).
    let size = 0;
    try {
      size = fs.statSync(resolvedPath).size;
    } catch {
      // Missing/unstatable file — the read below produces the Format 1 error.
    }
    if (size > PROXY_PRE_READ_MAX_BYTES) {
      throw new PathResolverError(
        `FS_ERROR: file too large for proxy pre-read (limit 25 MB): ${sanitizeLogText(resolvedPath)} — attach a smaller file or read a slice.`,
      );
    }
    try {
      const buf = fs.readFileSync(resolvedPath);
      newArgs.content_base64 = buf.toString("base64");
    } catch (err: any) {
      // §5.6: read failures share the single PathResolverError catch point so
      // they surface as MCP tool error results (never JSON-RPC -32603). One
      // shape, no branching: FS_ERROR prefix + resolved path (E-1).
      throw new PathResolverError(
        `FS_ERROR: Failed to read file ${sanitizeLogText(resolvedPath)}: ${sanitizeLogText(err?.message ?? String(err))}`,
      );
    }
    return newArgs;
  }

  /** Proxy output: extract output_base64 → write to file → rewrite response. */
  proxyOutput(toolName: string, args: Record<string, unknown>, result: any): any {
    return proxyToolOutput(
      {
        resolvePath: (p) => this.resolvePath(p),
        resolveRoot: () => this.resolveRoot(),
      },
      toolName, args, result,
    );
  }

  /**
   * Unwrap execute_dynamic_tool call — see Base64ProxyService/dynamic-tool.
   */
  unwrapDynamicTool(args: Record<string, unknown>): { toolName: string; innerArgs: Record<string, unknown> } | null {
    return unwrapDynamicTool(args);
  }

  /**
   * Wrap proxied inner args back into execute_dynamic_tool shape.
   */
  wrapDynamicTool(originalArgs: Record<string, unknown>, proxiedInnerArgs: Record<string, unknown>): Record<string, unknown> {
    return wrapDynamicTool(originalArgs, proxiedInnerArgs);
  }

  // --- Private helpers ---

  /**
   * Resolve a path against the workspace root via the shared helper.
   * Failures throw PathResolverError carrying the helper message verbatim
   * (C-5) — caught by WrapperServer.routeToolCall (§5.6).
   */
  private resolvePath(filePath: string): string {
    return this.resolvePathOrThrow(filePath).resolvedPath;
  }

  private resolvePathOrThrow(filePath: string): PathResolutionOk {
    const r = resolveWorkspacePath(filePath, { rootProvider: () => this.resolveRoot() });
    if (!r.ok) throw new PathResolverError(r.message);
    return r;
  }

  /** Live read in provider mode (UC-01 AF-2); plain value in string mode. */
  private resolveRoot(): string | undefined {
    return typeof this.workspaceRoot === "function"
      ? this.workspaceRoot()
      : this.workspaceRoot;
  }
}
