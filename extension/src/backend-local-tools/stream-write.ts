/**
 * stream_write_file local tool implementation.
 * Extracted from backend-local-tools.ts (BR-18 file-size limit).
 *
 * SA4E-356: all path handling goes through PathResolver.resolveWorkspacePath
 * (single validation point); N-9 (SEC-07) enforces the payload cap BEFORE
 * resolve — fail loud, never write.
 */
import * as fs from "fs";
import * as path from "path";
import {
  resolveWorkspacePath,
  sanitizeLogText,
  formatFileNotFound,
  formatFsError,
  type PathResolutionOk,
} from "../services/PathResolver";
import { STREAM_WRITE_MAX_BYTES } from "./constants";
import { checkSymlinkGuard, ensureDir } from "./fs-guards";

export function handleStreamWriteFile(args: Record<string, unknown>): any {
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
    return payloadTooLarge(rawDisplay);
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
  return writeContent(resolution, resolvedPath, content, mode);
}

/** N-9 payload-cap rejection (SEC-07, AD-21). */
function payloadTooLarge(rawDisplay: string): any {
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

/** Write or append the validated payload; maps ENOENT to the shared message. */
function writeContent(
  resolution: PathResolutionOk,
  resolvedPath: string,
  content: string,
  mode: string,
): any {
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
