/**
 * Output-side base64 proxy (Base64ProxyService).
 * Extract output_base64 from a tool result → write to file → rewrite response.
 */

import * as fs from "fs";
import * as path from "path";
import {
  resolveWorkspacePath,
  sanitizeLogText,
  PathResolverError,
} from "../PathResolver";
import { checkSymlinkGuard } from "../../backend-local-tools";

/** Instance-backed context injected by Base64ProxyService. */
export interface OutputProxyContext {
  isOutputTool: (toolName: string) => boolean;
  resolvePath: (filePath: string) => string;
  resolveRoot: () => string | undefined;
}

/** Proxy output: extract output_base64 → write to file → rewrite response. */
export function proxyToolOutput(
  ctx: OutputProxyContext,
  toolName: string,
  args: Record<string, unknown>,
  result: any,
): any {
  if (!ctx.isOutputTool(toolName)) return result;
  if (!result || result.isError) return result;
  const text = extractText(result);
  if (!text) return result;
  try {
    const parsed = JSON.parse(text);
    if (!parsed.output_base64) return result;
    const outputPath = resolveOutputPath(ctx, toolName, args, parsed.file_name);
    if (!outputPath) return result;
    const buf = Buffer.from(parsed.output_base64, "base64");
    ensureDir(path.dirname(outputPath));
    // I-7 guard for the proxy write (re-resolve is idempotent — PBT-02).
    const outResolution = resolveWorkspacePath(outputPath, {
      rootProvider: () => ctx.resolveRoot(),
    });
    if (!outResolution.ok) throw new PathResolverError(outResolution.message);
    const guardError = checkSymlinkGuard(outResolution, sanitizeLogText(outputPath));
    if (guardError) throw new PathResolverError(guardError);
    fs.writeFileSync(outputPath, buf);
    const updated = { ...parsed, file_path: outputPath, size_bytes: buf.length };
    delete updated.output_base64;
    return replaceText(result, JSON.stringify(updated));
  } catch (err) {
    // JSON parse or file write failed — return raw result to avoid silent data loss
    console.warn(`[Base64ProxyService] proxyOutput failed for '${toolName}': ${(err as Error).message}`);
    return result;
  }
}

/** Derive the output path from args (output_path > suggested file_name > file_path variants). */
function resolveOutputPath(
  ctx: OutputProxyContext,
  toolName: string,
  args: Record<string, unknown>,
  artifactName?: unknown,
): string | null {
  if (args.output_path) return ctx.resolvePath(args.output_path as string);
  const fp = args.file_path as string | undefined;
  if (!fp) return null;
  const resolved = ctx.resolvePath(fp);
  // Backend-suggested artifact name (e.g. export_docx → "BRD-v1.docx") keeps the
  // real extension and drops the output next to the source file.
  const suggested = suggestedFileName(artifactName);
  if (suggested) return path.join(path.dirname(resolved), suggested);
  if (resolved.endsWith(".drawio")) return resolved.replace(/\.drawio$/, ".png");
  return resolved + ".out";
}

/** Accept only a bare file name — never a path fragment supplied by a tool result. */
function suggestedFileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const base = path.basename(value.trim());
  return base.length > 0 && base !== "." && base !== ".." ? base : null;
}

function extractText(result: any): string | null {
  if (typeof result === "string") return result;
  if (result?.content?.[0]?.text) return result.content[0].text;
  return null;
}

function replaceText(result: any, newText: string): any {
  if (typeof result === "string") return newText;
  if (result?.content?.[0]?.text) {
    return { ...result, content: [{ type: "text", text: newText }] };
  }
  return result;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
