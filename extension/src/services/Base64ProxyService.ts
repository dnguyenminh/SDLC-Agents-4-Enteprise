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
 * SA4E-406: proxyInput honours the bound MCP session root (A6) and probes
 * multi-root candidates (F2/A8) via ./Base64ProxyService/input-proxy; the
 * output proxy forwards the session root as well (A6 — writes land in the
 * session root).
 *
 * Schema rewriting and dynamic-tool helpers live in ./Base64ProxyService/*.
 */
import {
  resolveWorkspacePath,
  PathResolverError,
  type PathResolutionOk,
  type WorkspaceRootProvider,
} from "./PathResolver";
import { extractBaseDirArg } from "./base-dir-resolution";
import type { ToolSchema } from "./Base64ProxyService/types";
import {
  hasBase64InputParam,
  hasBase64Output,
  rewriteSingleSchema,
} from "./Base64ProxyService/schema-rewrite";
import { unwrapDynamicTool, wrapDynamicTool } from "./Base64ProxyService/dynamic-tool";
import { proxyToolOutput } from "./Base64ProxyService/output-proxy";
import { proxyInputFile, PROXY_PRE_READ_MAX_BYTES, type InputProxyContext } from "./Base64ProxyService/input-proxy";
import type { ToolCallContext } from "../backend-local-tools/registry";

export type { ToolSchema } from "./Base64ProxyService/types";
export { PROXY_PRE_READ_MAX_BYTES };

export class Base64ProxyService {
  private base64InputTools = new Set<string>();
  private base64OutputTools = new Set<string>();

  /**
   * @param workspaceRoot Project/workspace root used to resolve relative
   *   file paths — either a captured string (backward compatible) or a live
   *   provider (production: reads vscode.workspace per call). Without a root,
   *   relative paths fail with PATH_NO_WORKSPACE and absolute paths pass
   *   through (PathResolver BR-06b / DISC-1).
   * @param foldersProvider SA4E-406 A8 — source of open workspace folders
   *   (injectable seam; defaults to the live vscode reader).
   */
  constructor(
    private readonly workspaceRoot?: string | WorkspaceRootProvider,
    private readonly foldersProvider?: () => string[],
  ) {}

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
  proxyInput(toolName: string, args: Record<string, unknown>, ctx?: ToolCallContext): Record<string, unknown> {
    if (!this.base64InputTools.has(toolName)) return args;
    const inputCtx: InputProxyContext = {
      resolveRoot: () => this.resolveRoot(),
      foldersProvider: this.foldersProvider,
      sessionRoot: ctx?.sessionRoot,
    };
    return proxyInputFile(toolName, args, inputCtx);
  }

  /** Proxy output: extract output_base64 → write to file → rewrite response. */
  proxyOutput(toolName: string, args: Record<string, unknown>, result: any, ctx?: ToolCallContext): any {
    return proxyToolOutput(
      {
        // SA4E-394: the output proxy honors the per-call base_dir so the
        // write-back lands inside the effective root (TC-111, DISC-4).
        // SA4E-406 A6: the session root governs the write-back as well.
        resolvePath: (p, baseDir) => this.resolvePath(p, baseDir ?? extractBaseDirArg(args), ctx?.sessionRoot),
        resolveRoot: () => this.resolveRoot(),
        sessionRoot: ctx?.sessionRoot,
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
   * SA4E-394: optional per-call base_dir/workspace_root (BR-10 precedence).
   * SA4E-406 A6: optional bound session root (containment gate first).
   */
  private resolvePath(filePath: string, baseDir?: unknown, sessionRoot?: string): string {
    return this.resolvePathOrThrow(filePath, baseDir, undefined, sessionRoot).resolvedPath;
  }

  private resolvePathOrThrow(
    filePath: string,
    baseDir?: unknown,
    workspaceRoot?: unknown,
    sessionRoot?: string,
  ): PathResolutionOk {
    const r = resolveWorkspacePath(filePath, {
      rootProvider: () => this.resolveRoot(),
      baseDir,
      workspaceRoot,
      sessionRoot,
    });
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
