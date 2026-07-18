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
 */
import * as fs from "fs";
import * as path from "path";

/** Describes a single tool's schema from the backend. */
export interface ToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class Base64ProxyService {
  private base64InputTools = new Set<string>();
  private base64OutputTools = new Set<string>();

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
    try {
      const buf = fs.readFileSync(filePath);
      newArgs.content_base64 = buf.toString("base64");
    } catch (err: any) {
      throw new Error(`Failed to read file ${filePath}: ${err.message}`);
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
      fs.writeFileSync(outputPath, buf);
      const updated = { ...parsed, file_path: outputPath, size_bytes: buf.length };
      delete updated.output_base64;
      return this.replaceText(result, JSON.stringify(updated));
    } catch { return result; }
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
      if (!props.file_path) {
        props.file_path = { type: "string", description: "Local file path to read" };
      }
      if (!required.includes("file_path")) required.push("file_path");
      const idx = required.indexOf("content_base64");
      if (idx >= 0) required.splice(idx, 1);
    }
    if (isOutput && !props.output_path) {
      props.output_path = { type: "string", description: "Output file path (optional, derived from file_path)" };
    }
    schema.properties = props;
    schema.required = required;
    return rewritten;
  }

  private resolveOutputPath(toolName: string, args: Record<string, unknown>): string | null {
    if (args.output_path) return args.output_path as string;
    const fp = args.file_path as string | undefined;
    if (!fp) return null;
    if (fp.endsWith(".drawio")) return fp.replace(/\.drawio$/, ".png");
    return fp + ".out";
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
