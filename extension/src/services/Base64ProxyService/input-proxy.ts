/**
 * Input-side base64 proxy core (SA4E-406 F2/F3/F5/A8 wiring).
 * Extracted from Base64ProxyService.proxyInput (200-line budget).
 *
 * Resolution order for a RELATIVE file_path (A8):
 *   (1) the bound MCP session root (containment gate — new-file writes land
 *       here too), then
 *   (2) existence-probed candidates: open workspace folders + the static
 *       allowlist (setting ∪ env), VS Code order, first existing pick, then
 *   (3) the legacy workspaceFolders[0] fallback (unchanged).
 * base_dir keeps its explicit effective-root branch (SA4E-394, unchanged).
 *
 * Failures are ACTIONABLE (F3): a relative path probed against candidate
 * roots but unreadable yields PATH_NO_CANDIDATE listing every probed root.
 * One F5 audit line records session/candidate/cwd_fallback picks.
 */
import * as fs from "fs";
import * as path from "path";
import { checkSymlinkGuard } from "../../backend-local-tools";
import {
  PathResolverError,
  resolveWorkspacePath,
  sanitizeLogText,
  type PathResolutionOk,
} from "../PathResolver";
import {
  existingRelativeCandidates,
  formatPathNoCandidate,
  logCandidateResolution,
} from "../root-candidates";
import { allWorkspaceFolderRoots } from "../workspace-roots";
import { extractBaseDirArg, staticWorkspaceRootList } from "../base-dir-resolution";

/** Maximum proxy pre-read file size (N-9, SEC-07 — SA policy). */
export const PROXY_PRE_READ_MAX_BYTES = 25 * 1024 * 1024;

/** Blank-free single-root list (legacy root into the F3 probed listing). */
function asRootList(root: string | undefined): string[] {
  return typeof root === "string" && root.trim() !== "" ? [root] : [];
}

/** Order-preserving case-folded dedupe (win32 keys fold — P7 semantics). */
function dedupeRoots(roots: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of roots) {
    const key = process.platform === "win32" ? root.toLowerCase() : root;
    if (!seen.has(key)) { seen.add(key); out.push(root); }
  }
  return out;
}

/** Context injected by Base64ProxyService (kept instance-side for tests). */
export interface InputProxyContext {
  /** Legacy root provider (string value or live provider). */
  resolveRoot: () => string | undefined;
  /** Open-workspace-folder source (injectable seam; default: live vscode). */
  foldersProvider?: () => string[];
  /** A6/A8 — the session root bound at MCP initialize (pre-admitted). */
  sessionRoot?: string;
}

/** Proxy input: read file_path → inject content_base64 into args. */
export function proxyInputFile(
  toolName: string,
  args: Record<string, unknown>,
  ctx: InputProxyContext,
): Record<string, unknown> {
  const filePath = args.file_path as string | undefined;
  if (!filePath || args.content_base64) return args;
  const newArgs = { ...args };
  const baseDirArg = extractBaseDirArg(args);
  const isRelative = !path.isAbsolute(filePath);
  // A8(2) — probe candidates ONLY for relative paths without an explicit
  // base_dir (that branch keeps its own effective-root semantics). The legacy
  // effective root is included so the F3 message names EVERY root considered
  // (the fallback root the read actually attempted last).
  const probeRoots = isRelative && baseDirArg === undefined
    ? dedupeRoots([
        ...(ctx.foldersProvider ?? allWorkspaceFolderRoots)(),
        ...staticWorkspaceRootList(),
        ...asRootList(ctx.resolveRoot()),
      ])
    : [];
  const candidates = existingRelativeCandidates(filePath, probeRoots);
  const resolution = resolveWorkspacePath(filePath, {
    rootProvider: ctx.resolveRoot,
    rootCandidates: candidates.length > 0 ? () => candidates : undefined,
    sessionRoot: ctx.sessionRoot,
    baseDir: args.base_dir,
    workspaceRoot: args.workspace_root,
  });
  if (!resolution.ok) throw new PathResolverError(resolution.message);
  // STC IT-05 step 3: the backend receives the RESOLVED ABSOLUTE path (same
  // contract as the chat path — backend dedup/scoping keys on absolute path).
  newArgs.file_path = resolution.resolvedPath;
  logCandidateResolution(toolName, resolution, candidates.length); // F5 — one line
  const guardError = checkSymlinkGuard(resolution, sanitizeLogText(String(filePath)));
  if (guardError) throw new PathResolverError(guardError);
  readWithCapAndCandidates(newArgs, toolName, filePath, resolution, {
    probeRoots,
    probed: isRelative && baseDirArg === undefined,
  });
  return newArgs;
}

/** N-9 pre-read cap + read; ENOENT becomes the F3 PATH_NO_CANDIDATE error. */
function readWithCapAndCandidates(
  newArgs: Record<string, unknown>,
  toolName: string,
  filePath: string,
  resolution: PathResolutionOk,
  scope: { probeRoots: string[]; probed: boolean },
): void {
  let size = 0;
  try {
    size = fs.statSync(resolution.resolvedPath).size;
  } catch {
    // Missing/unstatable file — the read below produces the Format 1 error.
  }
  if (size > PROXY_PRE_READ_MAX_BYTES) {
    throw new PathResolverError(
      `FS_ERROR: file too large for proxy pre-read (limit 25 MB): ${sanitizeLogText(resolution.resolvedPath)} — attach a smaller file or read a slice.`,
    );
  }
  try {
    const buf = fs.readFileSync(resolution.resolvedPath);
    newArgs.content_base64 = buf.toString("base64");
  } catch (err: any) {
    throw new PathResolverError(readErrorMessage(filePath, resolution, scope, err));
  }
}

/**
 * F3 — read-failure message. When the path was probed against candidate
 * roots (and none had it readable), name every probed root; otherwise keep
 * the single FS_ERROR shape (§5.6 — one shape, no branching, E-1).
 */
function readErrorMessage(
  filePath: string,
  resolution: PathResolutionOk,
  scope: { probeRoots: string[]; probed: boolean },
  err: any,
): string {
  if (scope.probed && scope.probeRoots.length > 0 && err?.code === "ENOENT") {
    return formatPathNoCandidate(filePath, scope.probeRoots);
  }
  // §5.6: read failures share the single PathResolverError catch point so
  // they surface as MCP tool error results (never JSON-RPC -32603).
  return `FS_ERROR: Failed to read file ${sanitizeLogText(resolution.resolvedPath)}: ${sanitizeLogText(err?.message ?? String(err))}`;
}
