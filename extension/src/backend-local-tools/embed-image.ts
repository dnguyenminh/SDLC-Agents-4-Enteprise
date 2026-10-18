/**
 * embed_image local tool implementation — replaces local image refs in
 * markdown with base64 data URIs.
 * Extracted from backend-local-tools.ts (BR-18 file-size limit).
 *
 * SA4E-356 (SEC-01, AD-15): every image ref is containment-checked against
 * the workspace root (fail-closed skip).
 */
import * as fs from "fs";
import * as path from "path";
import {
  resolveWorkspacePath,
  isPathWithinRoot,
  sanitizeLogText,
  formatFileNotFound,
  formatFsError,
  type PathResolutionOk,
} from "../services/PathResolver";
import { checkSymlinkGuard, ensureDir } from "./fs-guards";

/** MIME types by image extension for data-URI embedding. */
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
};

/** Matches markdown image references: ![alt](path "optional title"). */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(\s+"[^"]*")?\s*\)/g;

export function handleEmbedImage(args: Record<string, unknown>): any {
  // Alias `path` kept per AD-22 (same helper — no bypass).
  const rawInput = (args.file_path ?? args.path) as unknown;
  const rawDisplay = sanitizeLogText(String((args.file_path ?? args.path) ?? ""));
  const resolution = resolveWorkspacePath(rawInput);
  if (!resolution.ok) {
    console.warn(`[backend-local-tools] embed_image resolve failed: ${resolution.message}`);
    return { isError: true, content: [{ type: "text", text: resolution.message }] };
  }
  const output = resolveOutputTarget(args, resolution);
  if ("error" in output) { return output.error; }
  // I-7 guards BEFORE any fs touch (input read + output write).
  const inputGuardError = checkSymlinkGuard(resolution, rawDisplay);
  if (inputGuardError) {
    console.warn(`[backend-local-tools] embed_image input guard blocked: ${inputGuardError}`);
    return { isError: true, content: [{ type: "text", text: inputGuardError }] };
  }
  return embedAndWrite(resolution, output.outputPath, output.outputResolution, rawDisplay);
}

/** Resolve output_path (BR-11): explicit arg or derived from the input path. */
function resolveOutputTarget(
  args: Record<string, unknown>,
  resolution: PathResolutionOk,
): { outputPath: string; outputResolution: PathResolutionOk } | { error: any } {
  const rawOutput = args.output_path as unknown;
  if (typeof rawOutput === "string" && rawOutput.trim() !== "") {
    const outRes = resolveWorkspacePath(rawOutput);
    if (!outRes.ok) {
      console.warn(`[backend-local-tools] embed_image output resolve failed: ${outRes.message}`);
      return { error: { isError: true, content: [{ type: "text", text: outRes.message }] } };
    }
    return { outputPath: outRes.resolvedPath, outputResolution: outRes };
  }
  // output_path follows the same rule (BR-11); when absent it derives from
  // the RESOLVED input path, so it is inside the workspace by construction.
  const outputPath = defaultEmbeddedPath(resolution.resolvedPath);
  return {
    outputPath,
    outputResolution: {
      ok: true,
      resolvedPath: outputPath,
      rootSource: resolution.rootSource,
      rootPath: resolution.rootPath,
    },
  };
}

/** Read markdown → embed refs → write output (with I-7 guard on the write). */
function embedAndWrite(
  resolution: PathResolutionOk,
  outputPath: string,
  outputResolution: PathResolutionOk,
  rawDisplay: string,
): any {
  let markdown: string;
  try {
    markdown = fs.readFileSync(resolution.resolvedPath, "utf-8");
  } catch (err: any) {
    console.warn(`[backend-local-tools] embed_image read failed: ${sanitizeLogText(err?.message ?? String(err))}`);
    if (err?.code === "ENOENT") {
      return { isError: true, content: [{ type: "text", text: formatFileNotFound(resolution) }] };
    }
    return { isError: true, content: [{ type: "text", text: formatFsError("read", resolution, err) }] };
  }
  // baseDir fix: dirname of the RESOLVED path (second half of this tool's bug).
  const { output, embedded, skipped } = embedMarkdownImages(
    markdown,
    path.dirname(resolution.resolvedPath),
    resolution.rootPath,
  );
  try {
    ensureDir(path.dirname(outputPath));
  } catch (err: any) {
    return { isError: true, content: [{ type: "text", text: formatFsError("create parent dir", outputResolution, err) }] };
  }
  const outputGuardError = checkSymlinkGuard(outputResolution, rawDisplay);
  if (outputGuardError) {
    console.warn(`[backend-local-tools] embed_image output guard blocked: ${outputGuardError}`);
    return { isError: true, content: [{ type: "text", text: outputGuardError }] };
  }
  try {
    fs.writeFileSync(outputPath, output, "utf-8");
    return { isError: false, content: [{ type: "text", text: `Embedded ${embedded} image(s), skipped ${skipped} → ${outputPath}` }] };
  } catch (err: any) {
    console.warn(`[backend-local-tools] embed_image write failed: ${sanitizeLogText(err?.message ?? String(err))}`);
    return { isError: true, content: [{ type: "text", text: formatFsError("write", outputResolution, err) }] };
  }
}

function defaultEmbeddedPath(filePath: string): string {
  const ext = path.extname(filePath);
  return filePath.slice(0, filePath.length - ext.length) + "-embedded" + (ext || ".md");
}

/**
 * SA4E-356 (SEC-01, AD-15): every image ref is containment-checked against
 * the workspace root. Refs resolving outside are skipped fail-closed (kept
 * byte-identical, `skipped++`) — never thrown, never partially rewritten.
 * Exported for unit tests (T-SEC01).
 */
export function embedMarkdownImages(
  markdown: string,
  baseDir: string,
  root: string,
): { output: string; embedded: number; skipped: number } {
  let embedded = 0, skipped = 0;
  const output = markdown.replace(MD_IMAGE_RE, (match, alt, src, title) => {
    if (/^(https?:|data:)/i.test(src)) { skipped++; return match; }
    let abs: string;
    try {
      abs = path.resolve(baseDir, decodeURI(src));
    } catch { skipped++; return match; } // URIError on malformed `%` — fail closed
    // SEC-01: per-ref containment — outside root → skip fail-closed.
    if (!isPathWithinRoot(root, abs)) { skipped++; return match; }
    const dataUri = imageToDataUri(abs);
    if (!dataUri) { skipped++; return match; }
    embedded++;
    return `![${alt}](${dataUri}${title || ""})`;
  });
  return { output, embedded, skipped };
}

function imageToDataUri(imagePath: string): string | null {
  try {
    const mime = IMAGE_MIME[path.extname(imagePath).toLowerCase()] || "application/octet-stream";
    return `data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;
  } catch (err) {
    console.debug("[backend-local-tools] imageToDataUri failed for " + sanitizeLogText(imagePath) + ": " + sanitizeLogText((err as Error).message));
    return null;
  }
}
