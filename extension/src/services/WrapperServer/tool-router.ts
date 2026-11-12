/**
 * ToolRouter — resolves tools/call payloads: local tools, dynamic tool
 * discovery (find_tools / execute_dynamic_tool), and remote REST calls with
 * Base64ProxyService schema/input/output rewriting.
 */
import { executeLocalTool, getLocalToolDefinitions, isLocalTool } from "../../backend-local-tools";
import { PathResolverError } from "../PathResolver";
import type { WrapperServerDeps } from "./types";

export class ToolRouter {
  constructor(private readonly deps: WrapperServerDeps) {}

  async routeToolCall(params: any): Promise<any> {
    try {
      // NOTE: every delegating return is `return await` — a bare `return promise`
      // inside try/catch ADOPTS the promise OUTSIDE the try block, so a rejection
      // (e.g. PathResolverError from proxyInput) would escape this catch entirely
      // and leak as a JSON-RPC -32603 (classic async return-await gotcha).
      return await this.dispatch(params);
    } catch (err: any) {
      // SA4E-356 §5.6: path-resolution failures become MCP TOOL error results
      // (agent-readable Format 1/2 with CODE: prefix) — never JSON-RPC -32603.
      if (err instanceof PathResolverError) {
        this.deps.outputChannel.appendLine(`[WrapperServer] Path resolution failed: ${err.message}`);
        return { isError: true, content: [{ type: "text", text: err.message }] };
      }
      throw err;
    }
  }

  private async dispatch(params: any): Promise<any> {
    const name = params.name as string;
    const args = (params.arguments || {}) as Record<string, unknown>;
    if (isLocalTool(name)) return await executeLocalTool(name, args);
    if (name === "find_tools") return await this.handleFindTools(args);
    if (name === "execute_dynamic_tool") return await this.handleDynamic(args);
    return await this.callWithProxy(name, args);
  }

  async getToolsRewritten(): Promise<any[]> {
    const tools = await this.deps.restGetTools();
    this.deps.base64Proxy.detectFromToolList(tools);
    return this.deps.base64Proxy.rewriteSchemasForLlm(tools);
  }

  private async handleFindTools(args: Record<string, unknown>): Promise<any> {
    const result = await this.deps.restCallTool("find_tools", args);
    return this.rewriteFindToolsResponse(result);
  }

  private async handleDynamic(args: Record<string, unknown>): Promise<any> {
    const unwrapped = this.deps.base64Proxy.unwrapDynamicTool(args);
    if (!unwrapped) return this.deps.restCallTool("execute_dynamic_tool", args);
    const { toolName, innerArgs } = unwrapped;
    if (toolName === "find_tools") {
      const result = await this.deps.restCallTool("execute_dynamic_tool", args);
      return this.rewriteFindToolsResponse(result);
    }
    if (isLocalTool(toolName)) return executeLocalTool(toolName, innerArgs);
    // File tools discovered at runtime (export_docx, …) may not be in any tool
    // list yet — resolve their schema once before deciding how to proxy.
    if ("file_path" in innerArgs && !this.deps.base64Proxy.needsInputProxy(toolName)) {
      await this.ensureProxyDetection(toolName);
    }
    const proxied = this.deps.base64Proxy.proxyInput(toolName, innerArgs);
    const finalArgs = this.deps.base64Proxy.wrapDynamicTool(args, proxied);
    let result = await this.deps.restCallTool("execute_dynamic_tool", finalArgs);
    result = this.deps.base64Proxy.proxyOutput(toolName, innerArgs, result);
    return result;
  }

  /**
   * Best-effort schema lookup for a dynamic tool so the proxy contract
   * (file_path ↔ content_base64 / output_base64) applies on first use.
   * Tools without the markers are simply not registered.
   */
  private async ensureProxyDetection(toolName: string): Promise<void> {
    try {
      const result = await this.deps.restCallTool("find_tools", { query: toolName, top_k: 10 });
      const text = result?.content?.[0]?.text;
      if (!text) return;
      const parsed = JSON.parse(text);
      const tools = Array.isArray(parsed?.tools) ? parsed.tools : parsed;
      if (Array.isArray(tools)) this.deps.base64Proxy.registerTools(tools);
    } catch {
      // Detection is additive; the call proceeds unchanged when the lookup fails.
    }
  }

  /**
   * Rewrite find_tools response: merge local tool definitions (stream_write_file,
   * embed_image, pega_*) so LLM can discover them, then rewrite base64 schemas.
   */
  private rewriteFindToolsResponse(result: any): any {
    if (!result?.content?.[0]?.text) return result;
    try {
      const parsed = JSON.parse(result.content[0].text);
      const tools = parsed.tools || parsed;
      if (!Array.isArray(tools)) return result;
      const merged = this.mergeLocalToolDefinitions(tools);
      // Catalog entries may be the only schemas the agent ever sees for dynamic
      // tools (export_docx, export_pdf, …) — register them for input/output proxying.
      this.deps.base64Proxy.registerTools(merged as Array<{ name: string; description?: string; schema?: Record<string, unknown> }>);
      const rewritten = this.deps.base64Proxy.rewriteSchemasForLlm(merged);
      const output = parsed.tools ? { ...parsed, tools: rewritten } : rewritten;
      return { ...result, content: [{ type: "text", text: JSON.stringify(output) }] };
    } catch (err) {
      // Not a valid tool list — return original result unchanged
      console.warn(`[WrapperServer] rewriteFindToolsResponse parse failed: ${(err as Error).message}`);
      return result;
    }
  }

  /** Append local tool definitions to a tool list, skipping duplicates by name. */
  private mergeLocalToolDefinitions(tools: any[]): any[] {
    const localDefs = getLocalToolDefinitions();
    const existing = new Set(tools.map((t) => t?.name));
    const added = localDefs.filter((d) => !existing.has(d.name));
    if (added.length === 0) return tools;
    return [...tools, ...added];
  }

  private async callWithProxy(name: string, args: Record<string, unknown>): Promise<any> {
    const finalArgs = this.deps.base64Proxy.proxyInput(name, args);
    let result = await this.deps.restCallTool(name, finalArgs);
    result = this.deps.base64Proxy.proxyOutput(name, args, result);
    return result;
  }
}
