/**
 * Output-side base64 proxy (Base64ProxyService).
 * Extract output_base64 (or outputs[]) from a tool result → write file(s) →
 * rewrite the response. Works for tools detected from either tools/list or the
 * find_tools catalog — the backend only emits output_base64 in wrapper mode.
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
  resolvePath: (filePath: string) => string;
  resolveRoot: () => string | undefined;
}

/** Proxy output: extract base64 payloads → write files → rewrite response. */
export function proxyToolOutput(
  ctx: OutputProxyContext,
  toolName: string,
  args: Record<string, unknown>,
  result: any,
): any {
  if (!result || result.isError) return result;
  const text = extractText(result);
  if (!text) return result;

  // Wrapper mode: the caller handed us a source/output path, so the backend must
  // answer with bytes. Paths are never an acceptable result in this mode.
  const wrapperMode =
    typeof args.file_path === "string" || typeof args.content_base64 === "string";

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return result;
  }

  const outputs = collectOutputs(parsed);
  if (outputs.length === 0) return wrapperMode ? missingPayload(result, parsed) : result;

  try {
    const multi = outputs.length > 1;
    const written: Array<Record<string, unknown>> = [];
    for (const output of outputs) {
      if (typeof output.output_base64 !== "string") continue;
      const outputPath = resolveOutputPath(ctx, args, output.file_name, multi);
      if (!outputPath) continue;
      const buf = Buffer.from(output.output_base64, "base64");
      ensureDir(path.dirname(outputPath));
      // I-7 guard for the proxy write (re-resolve is idempotent — PBT-02).
      const outResolution = resolveWorkspacePath(outputPath, {
        rootProvider: () => ctx.resolveRoot(),
      });
      if (!outResolution.ok) throw new PathResolverError(outResolution.message);
      const guardError = checkSymlinkGuard(outResolution, sanitizeLogText(outputPath));
      if (guardError) throw new PathResolverError(guardError);
      fs.writeFileSync(outputPath, buf);
      const { output_base64: _payload, ...meta } = output;
      written.push({ ...meta, file_path: outputPath, size_bytes: buf.length });
    }
    if (written.length === 0) {
      return wrapperMode
        ? failure(result, `PROXY_WRITE_FAILED: no artifact could be written for '${toolName}'.`)
        : result;
    }
    if (wrapperMode && written.length !== outputs.length) {
      return failure(
        result,
        `PROXY_WRITE_FAILED: only ${written.length}/${outputs.length} artifacts could be written for '${toolName}'.`,
      );
    }

    const updated: Record<string, unknown> = { ...parsed, ...written[0] };
    delete updated.output_base64;
    delete updated.outputs;
    if (written.length > 1) updated.outputs = written;
    return replaceText(result, JSON.stringify(updated));
  } catch (err) {
    console.warn(`[Base64ProxyService] proxyOutput failed for '${toolName}': ${(err as Error).message}`);
    // Silent fall-through would return the child's path — fail loudly in wrapper mode.
    return wrapperMode
      ? failure(
          result,
          `PROXY_WRITE_FAILED: ${sanitizeLogText((err as Error).message)} — no file was written.`,
        )
      : result;
  }
}

/** Wrapper mode returned artifact metadata but no bytes: surface a hard error. */
function missingPayload(result: any, parsed: any): any {
  const artifacts = Array.isArray(parsed?.artifacts) ? parsed.artifacts : [];
  if (artifacts.length === 0) return result;
  const names = artifacts
    .map((artifact: any) => suggestedFileName(artifact?.name))
    .filter((name: string | null): name is string => !!name)
    .join(", ");
  return failure(
    result,
    `ARTIFACT_FETCH_FAILED: ${names || "artifact"} was returned without content ` +
      "(the backend could not read the artifact). No file was written.",
  );
}

/** MCP tool error result — the agent sees a clear failure instead of a path. */
function failure(result: any, text: string): any {
  return { ...result, isError: true, content: [{ type: "text", text }] };
}

/** Normalise single `output_base64` and multi `outputs[]` payloads. */
function collectOutputs(parsed: any): any[] {
  if (Array.isArray(parsed?.outputs) && parsed.outputs.length > 0) return parsed.outputs;
  if (typeof parsed?.output_base64 === "string") {
    return [{ file_name: parsed.file_name, output_base64: parsed.output_base64 }];
  }
  return [];
}

/** Derive the output path (output_path > backend file_name > file_path variants). */
function resolveOutputPath(
  ctx: OutputProxyContext,
  args: Record<string, unknown>,
  artifactName: unknown,
  multi: boolean,
): string | null {
  const suggested = suggestedFileName(artifactName);
  if (args.output_path) {
    const resolved = ctx.resolvePath(args.output_path as string);
    // Multi-file results keep the directory but must use each artifact's own name.
    if (!multi) return resolved;
    return suggested ? path.join(path.dirname(resolved), suggested) : null;
  }
  const fp = args.file_path as string | undefined;
  if (!fp) return null;
  const resolved = ctx.resolvePath(fp);
  // Backend-suggested artifact name (e.g. export_docx → "BRD-v1.docx") keeps the
  // real extension and drops the output next to the source file.
  if (suggested) return path.join(path.dirname(resolved), suggested);
  if (multi) return null;
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
