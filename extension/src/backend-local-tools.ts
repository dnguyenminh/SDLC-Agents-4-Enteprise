/**
 * Local tool execution layer for RemoteBackendClient.
 * Handles tools that execute locally (stream_write_file, embed_image, pega_*).
 *
 * Base64 proxy logic has been extracted to services/Base64ProxyService.ts
 * following SRP — this file only handles local tool execution + definitions.
 *
 * OCP: Tool handlers registered in LOCAL_TOOL_REGISTRY — adding a new local
 * tool does NOT require editing executeLocalTool().
 *
 * SA4E-356: all path handling goes through PathResolver.resolveWorkspacePath
 * (single validation point). The legacy inline resolve + containment block and
 * the module-level vscode lazy-require were removed with that refactor.
 */
import * as fs from "fs";
import * as path from "path";
import {
  resolveWorkspacePath,
  isPathWithinRoot,
  sanitizeLogText,
  formatFileNotFound,
  formatFsError,
  FILE_PATH_SCHEMA_DESCRIPTION,
  type PathResolutionOk,
} from "./services/PathResolver";

/** Maximum stream_write_file content size (N-9, SEC-07 — SA policy). */
export const STREAM_WRITE_MAX_BYTES = 10 * 1024 * 1024;

/** Type for a local tool handler function. */
type LocalToolHandler = (args: Record<string, unknown>) => unknown;

/** Definition shape for a local tool (injected into tools/list). */
export interface LocalToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Hidden tools are executable + discoverable via find_tools but omitted from tools/list. */
  hidden?: boolean;
}

/** A registry entry couples a handler with its definition. */
interface LocalToolEntry {
  handler: LocalToolHandler;
  definition: LocalToolDefinition;
}

/**
 * Registry of local tool handlers — OCP compliant.
 * To add a new local tool: call registerLocalTool(name, handler, definition).
 */
const LOCAL_TOOL_REGISTRY: Map<string, LocalToolEntry> = new Map([
  ["stream_write_file", { handler: handleStreamWriteFile, definition: streamWriteFileDefinition() }],
  ["embed_image", { handler: handleEmbedImage, definition: embedImageDefinition() }],
]);

/**
 * Register a new local tool handler + definition (OCP: no switch/case needed).
 */
export function registerLocalTool(
  name: string,
  handler: LocalToolHandler,
  definition: LocalToolDefinition,
): void {
  LOCAL_TOOL_REGISTRY.set(name, { handler, definition });
}

/** Whether a tool name is handled locally (no backend forwarding). */
export function isLocalTool(name: string): boolean {
  return LOCAL_TOOL_REGISTRY.has(name);
}

export async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const entry = LOCAL_TOOL_REGISTRY.get(name);
  if (entry) return entry.handler(args);
  return { isError: true, content: [{ type: "text", text: `Local tool '${name}' not implemented.` }] };
}

/** Tool definitions for local tools, injected into tools/list responses. */
export function getLocalToolDefinitions(): LocalToolDefinition[] {
  return [...LOCAL_TOOL_REGISTRY.values()].map((e) => e.definition);
}

/**
 * Visible tool definitions for tools/list — excludes hidden tools.
 * Hidden tools stay discoverable via find_tools and callable via
 * execute_dynamic_tool, but do not clutter the LLM tool list.
 */
export function getVisibleLocalToolDefinitions(): LocalToolDefinition[] {
  return getLocalToolDefinitions().filter((d) => !d.hidden);
}

/**
 * I-7 parent-dir realpath guard (TDD §3.7 step 3.5, SEC-03/AD-17).
 * Re-checks the lexical containment against the REAL parent directory to
 * close symlink/junction/subst escapes. Realpaths the PARENT only — never
 * the file itself — so writing NEW files keeps working.
 * Callers: run AFTER ensureDir for writes (parent must exist to realpath),
 * BEFORE any fs.* touch. Returns an error message, or null when clean.
 * Skipped entirely when rootSource is cwd_fallback (no boundary there).
 */
export function checkSymlinkGuard(
  resolution: PathResolutionOk,
  rawDisplay: string,
): string | null {
  if (resolution.rootSource !== "workspace") return null;
  const parentDir = path.dirname(resolution.resolvedPath);
  let realParent: string;
  try {
    realParent = fs.realpathSync(parentDir);
  } catch (err: any) {
    return `FS_ERROR: Failed to resolve parent dir ${sanitizeLogText(parentDir)}: ${sanitizeLogText(err?.message ?? String(err))}`;
  }
  const realCandidate = path.join(realParent, path.basename(resolution.resolvedPath));
  if (!isPathWithinRoot(resolution.rootPath, realCandidate)) {
    return (
      `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: ${sanitizeLogText(rawDisplay)} resolves to ` +
      `${sanitizeLogText(resolution.resolvedPath)} — outside workspace root ` +
      `${sanitizeLogText(resolution.rootPath)} via symlink/junction.`
    );
  }
  return null;
}

// --- Local tool implementations ---

function streamWriteFileDefinition(): LocalToolDefinition {
  return {
    name: "stream_write_file",
    description: "Write or append content to a local workspace file (creates parent dirs). Path can be relative to workspace root.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION },
        content: { type: "string", description: "Content to write" },
        mode: { type: "string", enum: ["write", "append"], default: "write" },
      },
      required: ["file_path", "content"],
    },
  };
}

function embedImageDefinition(): LocalToolDefinition {
  return {
    name: "embed_image",
    description: "Replace local image refs in markdown with base64 data URIs.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: FILE_PATH_SCHEMA_DESCRIPTION },
        output_path: {
          type: "string",
          description:
            FILE_PATH_SCHEMA_DESCRIPTION +
            " Defaults to <file_path> with '-embedded' inserted before the extension.",
        },
      },
      required: ["file_path"],
    },
  };
}

function handleStreamWriteFile(args: Record<string, unknown>): any {
  // SA4E-356 (SEC-08b, AD-22): the `path` alias is kept (callers outside the
  // schema may use it) but NOT added to the schema (BR-09 minimal). Both
  // aliases flow through the same helper, so there is no bypass.
  const rawPath = (args.file_path ?? args.path) as unknown;
  const rawDisplay = sanitizeLogText(String((args.file_path ?? args.path) ?? ""));
  const content = args.content as string;
  const mode = (args.mode as string) || "write";
  // PathResolver is the single validation point for file_path (AD-12) — only
  // the content check stays here.
  if (typeof content !== "string") {
    return { isError: true, content: [{ type: "text", text: "'file_path' and 'content' required." }] };
  }
  // N-9 (SEC-07, AD-21): payload cap BEFORE resolve — fail loud, never write.
  if (Buffer.byteLength(content, "utf-8") > STREAM_WRITE_MAX_BYTES) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            "FS_ERROR: payload too large (limit 10 MB): refusing to write " +
            `'${rawDisplay}'. Split the write into smaller chunks.`,
        },
      ],
    };
  }
  // (1) resolve FIRST — before any fs.* (I-1).
  const resolution = resolveWorkspacePath(rawPath);
  // (2) fail → forward VERBATIM, return NOW (C-5, C-6).
  if (!resolution.ok) {
    console.warn(`[backend-local-tools] stream_write_file resolve failed: ${resolution.message}`);
    return { isError: true, content: [{ type: "text", text: resolution.message }] };
  }
  const resolvedPath = resolution.resolvedPath;
  try {
    ensureDir(path.dirname(resolvedPath));
  } catch (err: any) {
    return { isError: true, content: [{ type: "text", text: formatFsError("create parent dir", resolution, err) }] };
  }
  // (3.5) symlink/junction guard (I-7) — parent exists now (ensureDir above).
  const guardError = checkSymlinkGuard(resolution, rawDisplay);
  if (guardError) {
    console.warn(`[backend-local-tools] stream_write_file guard blocked: ${guardError}`);
    return { isError: true, content: [{ type: "text", text: guardError }] };
  }
  try {
    if (mode === "append") {
      fs.appendFileSync(resolvedPath, content, "utf-8");
      return { isError: false, content: [{ type: "text", text: `Appended to: ${resolvedPath}` }] };
    }
    fs.writeFileSync(resolvedPath, content, "utf-8");
    return { isError: false, content: [{ type: "text", text: `Wrote file: ${resolvedPath}` }] };
  } catch (err: any) {
    console.warn(`[backend-local-tools] stream_write_file fs failed: ${sanitizeLogText(err?.message ?? String(err))}`);
    if (err?.code === "ENOENT") {
      return { isError: true, content: [{ type: "text", text: formatFileNotFound(resolution) }] };
    }
    return {
      isError: true,
      content: [{ type: "text", text: formatFsError(mode === "append" ? "append to" : "write", resolution, err) }],
    };
  }
}

/** MIME types by image extension for data-URI embedding. */
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
};

/** Matches markdown image references: ![alt](path "optional title"). */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(\s+"[^"]*")?\s*\)/g;

function handleEmbedImage(args: Record<string, unknown>): any {
  // Alias `path` kept per AD-22 (same helper — no bypass).
  const rawInput = (args.file_path ?? args.path) as unknown;
  const rawDisplay = sanitizeLogText(String((args.file_path ?? args.path) ?? ""));
  const resolution = resolveWorkspacePath(rawInput);
  if (!resolution.ok) {
    console.warn(`[backend-local-tools] embed_image resolve failed: ${resolution.message}`);
    return { isError: true, content: [{ type: "text", text: resolution.message }] };
  }
  // output_path follows the same rule (BR-11); when absent it derives from
  // the RESOLVED input path, so it is inside the workspace by construction.
  const rawOutput = args.output_path as unknown;
  let outputPath: string;
  let outputResolution: PathResolutionOk;
  if (typeof rawOutput === "string" && rawOutput.trim() !== "") {
    const outRes = resolveWorkspacePath(rawOutput);
    if (!outRes.ok) {
      console.warn(`[backend-local-tools] embed_image output resolve failed: ${outRes.message}`);
      return { isError: true, content: [{ type: "text", text: outRes.message }] };
    }
    outputPath = outRes.resolvedPath;
    outputResolution = outRes;
  } else {
    outputPath = defaultEmbeddedPath(resolution.resolvedPath);
    outputResolution = {
      ok: true,
      resolvedPath: outputPath,
      rootSource: resolution.rootSource,
      rootPath: resolution.rootPath,
    };
  }
  // I-7 guards BEFORE any fs touch (input read + output write).
  const inputGuardError = checkSymlinkGuard(resolution, rawDisplay);
  if (inputGuardError) {
    console.warn(`[backend-local-tools] embed_image input guard blocked: ${inputGuardError}`);
    return { isError: true, content: [{ type: "text", text: inputGuardError }] };
  }
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
    console.debug("[backend-local-tools] imageToDataUri failed for " + imagePath + ": " + (err as Error).message);
    return null;
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
