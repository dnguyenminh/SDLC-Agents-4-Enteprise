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
 */
import * as fs from "fs";
import * as path from "path";
import { checkSymlinkGuard } from "../backend-local-tools";
import {
  resolveWorkspacePath,
  sanitizeLogText,
  PathResolverError,
  FILE_PATH_SCHEMA_DESCRIPTION,
  type PathResolutionOk,
  type WorkspaceRootProvider,
} from "./PathResolver";

/** Maximum proxy pre-read file size (N-9, SEC-07 — SA policy). */
export const PROXY_PRE_READ_MAX_BYTES = 25 * 1024 * 1024;

/** Describes a single tool's schema from the backend. */
export interface ToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

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

  /** Scan tool list from backend and auto-detect proxy requirements. */
  detectFromToolList(tools: ToolSchema[]): void {
    this.base64InputTools.clear();
    this.base64OutputTools.clear();
    for (const tool of tools) {
      if (this.hasBase64InputParam(tool)) {
        this.base64InputTools.add(tool.name);
      }
      if (this.hasBase64Output(tool)) {
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
    return tools.map((tool) => this.rewriteSingleSchema(tool));
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
    if (!this.base64OutputTools.has(toolName)) return result;
    if (!result || result.isError) return result;
    const text = this.extractText(result);
    if (!text) return result;
    try {
      const parsed = JSON.parse(text);
      if (!parsed.output_base64) return result;
      const outputPath = this.resolveOutputPath(toolName, args);
      if (!outputPath) return result;
      const buf = Buffer.from(parsed.output_base64, "base64");
      this.ensureDir(path.dirname(outputPath));
      // I-7 guard for the proxy write (re-resolve is idempotent — PBT-02).
      const outResolution = resolveWorkspacePath(outputPath, {
        rootProvider: () => this.resolveRoot(),
      });
      if (!outResolution.ok) throw new PathResolverError(outResolution.message);
      const guardError = checkSymlinkGuard(outResolution, sanitizeLogText(outputPath));
      if (guardError) throw new PathResolverError(guardError);
      fs.writeFileSync(outputPath, buf);
      const updated = { ...parsed, file_path: outputPath, size_bytes: buf.length };
      delete updated.output_base64;
      return this.replaceText(result, JSON.stringify(updated));
    } catch (err) {
      // JSON parse or file write failed — return raw result to avoid silent data loss
      console.warn(`[Base64ProxyService] proxyOutput failed for '${toolName}': ${(err as Error).message}`);
      return result;
    }
  }

  /**
   * Unwrap execute_dynamic_tool call:
   * Extract nested toolName + arguments for proxy processing.
   */
  unwrapDynamicTool(args: Record<string, unknown>): { toolName: string; innerArgs: Record<string, unknown> } | null {
    const toolName = (args.toolName ?? args.tool_name) as string | undefined;
    if (!toolName) return null;
    const innerArgs = (args.arguments ?? args.args ?? {}) as Record<string, unknown>;
    return { toolName, innerArgs };
  }

  /**
   * Wrap proxied inner args back into execute_dynamic_tool shape.
   */
  wrapDynamicTool(originalArgs: Record<string, unknown>, proxiedInnerArgs: Record<string, unknown>): Record<string, unknown> {
    const newArgs = { ...originalArgs };
    if ("arguments" in originalArgs) {
      newArgs.arguments = proxiedInnerArgs;
    } else if ("args" in originalArgs) {
      newArgs.args = proxiedInnerArgs;
    }
    return newArgs;
  }

  // --- Private detection helpers ---

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

  private hasBase64InputParam(tool: ToolSchema): boolean {
    const schema = tool.inputSchema;
    if (!schema) return false;
    const props = schema.properties as Record<string, any> | undefined;
    if (!props) return false;
    return "content_base64" in props;
  }

  private hasBase64Output(tool: ToolSchema): boolean {
    const desc = tool.description || "";
    return desc.includes("output_base64") || desc.includes("Returns output_base64");
  }

  private rewriteSingleSchema(tool: ToolSchema): ToolSchema {
    const isInput = this.base64InputTools.has(tool.name);
    const isOutput = this.base64OutputTools.has(tool.name);
    if (!isInput && !isOutput) return tool;
    const rewritten = { ...tool, inputSchema: { ...tool.inputSchema } };
    const schema = rewritten.inputSchema!;
    const props = { ...(schema.properties as Record<string, any> || {}) };
    const required = [...(schema.required as string[] || [])];
    if (isInput) {
      delete props.content_base64;
      // M-1: file_path description is ALWAYS overwritten with the shared rule
      // (closes the mem_ingest_file no-description + drawio_export_png
      // "reference only" holes — FSD §3.2.2).
      props.file_path = { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION };
      if (!required.includes("file_path")) required.push("file_path");
      const idx = required.indexOf("content_base64");
      if (idx >= 0) required.splice(idx, 1);
    }
    if (isOutput && !props.output_path) {
      // M-2: suffix covers BOTH resolveOutputPath derived branches
      // (.drawio→.png swap; non-.drawio gets .out appended — DISC-2).
      props.output_path = {
        type: "string",
        description:
          FILE_PATH_SCHEMA_DESCRIPTION +
          " Defaults to <file_path> with extension swapped (.drawio→.png; non-.drawio inputs get .out appended).",
      };
    }
    schema.properties = props;
    schema.required = required;
    return rewritten;
  }

  private resolveOutputPath(toolName: string, args: Record<string, unknown>): string | null {
    if (args.output_path) return this.resolvePath(args.output_path as string);
    const fp = args.file_path as string | undefined;
    if (!fp) return null;
    const resolved = this.resolvePath(fp);
    if (resolved.endsWith(".drawio")) return resolved.replace(/\.drawio$/, ".png");
    return resolved + ".out";
  }

  private extractText(result: any): string | null {
    if (typeof result === "string") return result;
    if (result?.content?.[0]?.text) return result.content[0].text;
    return null;
  }

  private replaceText(result: any, newText: string): any {
    if (typeof result === "string") return newText;
    if (result?.content?.[0]?.text) {
      return { ...result, content: [{ type: "text", text: newText }] };
    }
    return result;
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}
