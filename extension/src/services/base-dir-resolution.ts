/**
 * SA4E-394 — per-call base_dir resolution for extension-executed tools
 * (C-5 bundle boundary: the extension cannot import backend ESM modules, so
 * the contract is duplicated here and verified behaviorally by the shared
 * test matrix — TC-702 contract parity).
 *
 * Same normative order as the backend resolver: normalize (BR-09) → allowlist
 * (BR-05) → resolve (BR-02/04) → containment AFTER resolution (BR-07).
 * Pure string ops + fs for the allowlist/trust path — NEVER throws.
 *
 * SA4E-406: F1 unions the LIVE workspace folders into the allowlist; A7 moves
 * the admission decision to the parents rule (see ./root-trust).
 */
import * as path from "path";
import { allWorkspaceFolderRoots } from "./workspace-roots";
import { foldPathKey, isPathWithinRoot } from "./path-containment";
import { isRootAdmitted, trustedParentsHint } from "./root-trust";
import type { PathResolutionErr, PathResolutionResult } from "./PathResolver";
import { sanitizeLogText } from "./path-format";

/** Allowlist keys are case-folded on win32 (backend P7 semantics). */
function foldKey(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

/** BR-10 — base_dir wins over the deprecated workspace_root alias. */
export function extractBaseDirArg(args: Record<string, unknown>): string | undefined {
  for (const candidate of [args.base_dir, args.workspace_root]) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return undefined;
}

/** Sentinel — a non-string base_dir was supplied (typed error, no echo). */
export const INVALID_BASE_DIR = Symbol("invalid-base-dir");

/** Alias precedence + type/emptiness screening for resolver opts (BR-10). */
export function pickBaseDir(
  opts?: { baseDir?: unknown; workspaceRoot?: unknown },
): string | undefined | typeof INVALID_BASE_DIR {
  for (const candidate of [opts?.baseDir, opts?.workspaceRoot]) {
    if (candidate === undefined) continue;
    if (typeof candidate !== "string") return INVALID_BASE_DIR;
    if (candidate.trim() === "") continue;
    return candidate;
  }
  return undefined;
}

/**
 * Allowlist mirror (TDD §6.3) — SA4E-406 F1: the UNION of
 *   (a) VS Code setting `sdlcAgents.workspace.workspaceRoots` (string[]),
 *   (b) env `MCP_WORKSPACE_ROOTS`,
 *   (c) the LIVE `vscode.workspace.workspaceFolders` fsPaths (read per call,
 *       same lazy-require pattern as PathResolver; skip undefined/empty),
 * plus (A7) the admitted session root for this call when the caller has one.
 *
 * SECURITY RATIONALE (F1): a relative path under an open workspace folder is
 * ALREADY accepted by containment alone (PathResolver step 4 / base_dir step
 * 4), so admitting the open folders to the base_dir allowlist equalizes trust
 * — it grants nothing a relative path could not already do. Orca worktrees
 * are opened as workspace folders but rarely present in settings/env; without
 * the union every base_dir call against them failed with
 * PATH_REJECTED_OUTSIDE_ALLOWLIST. Pure-ish and never-throwing; `folderRoots`
 * is an injectable seam (tests) defaulting to the live reader.
 */
export function getExtensionWorkspaceRoots(
  opts?: { folderRoots?: () => string[]; sessionRoot?: string },
): ReadonlySet<string> {
  const roots = new Set<string>();
  const folders = opts?.folderRoots ?? allWorkspaceFolderRoots;
  for (const entry of [...readSettingRoots(), ...readEnvRoots(), ...folders()]) {
    if (typeof entry !== "string" || entry.trim() === "") continue;
    roots.add(foldKey(path.resolve(entry.trim())));
  }
  if (typeof opts?.sessionRoot === "string" && opts.sessionRoot.trim() !== "") {
    roots.add(foldKey(path.resolve(opts.sessionRoot.trim())));
  }
  return roots;
}

/**
 * Static allowlist entries (setting ∪ env, RAW case, resolved) for callers
 * that need an ordered candidate list rather than the folded Set (A8 feed).
 */
export function staticWorkspaceRootList(): string[] {
  const out: string[] = [];
  for (const entry of [...readSettingRoots(), ...readEnvRoots()]) {
    if (typeof entry !== "string" || entry.trim() === "") continue;
    out.push(path.resolve(entry.trim()));
  }
  return out;
}

function readSettingRoots(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require("vscode");
    const cfg = vscode?.workspace?.getConfiguration?.("sdlcAgents.workspace");
    const value = cfg?.get?.("workspaceRoots");
    return Array.isArray(value) ? value.filter((v: unknown): v is string => typeof v === "string") : [];
  } catch {
    return []; // non-extension-host context (tests) — env fallback applies
  }
}

function readEnvRoots(): string[] {
  const raw = process.env["MCP_WORKSPACE_ROOTS"];
  if (!raw) return [];
  return raw.split(path.delimiter);
}

/** True when the normalized root is registered in the allowlist mirror. */
export function isRootAllowlisted(normalizedRoot: string, allowlist?: ReadonlySet<string>): boolean {
  const set = allowlist ?? getExtensionWorkspaceRoots();
  return set.size > 0 && set.has(foldKey(path.resolve(normalizedRoot)));
}

function err(code: PathResolutionErr["code"], message: string, rawPath: string): PathResolutionErr {
  return {
    ok: false, code, message,
    rawPath, resolvedPath: "", rootSource: null, rootPath: "",
  };
}

/**
 * base_dir branch — mirrors backend MultiWorktreePathResolver.resolveWithBaseDir.
 * SA4E-406 A7: admission is the parents rule (allowlist / session root /
 * trusted parents / open folders) — see ./root-trust. The legacy rejection
 * message stays byte-identical when no parents are configured (extend,
 * don't break); with parents configured a sanitized hint names them.
 */
export function resolveWithBaseDir(
  rawPath: unknown,
  baseDir: string,
  opts?: { allowlist?: ReadonlySet<string>; sessionRoot?: string },
): PathResolutionResult {
  if (typeof rawPath !== "string" || rawPath.trim() === "") {
    return err("PATH_EMPTY", "PATH_EMPTY: 'file_path' must be a non-empty string.", "");
  }
  if (rawPath.includes("\0")) {
    return err("PATH_INVALID", "PATH_INVALID: 'file_path' contains invalid characters (NUL byte).", sanitizeLogText(rawPath));
  }
  const normalizedRoot = path.resolve(baseDir.trim()); // BR-09 before allowlist (T8)
  if (!isRootAdmitted(normalizedRoot, opts?.allowlist, opts?.sessionRoot)) {
    return err(
      "PATH_REJECTED_OUTSIDE_ALLOWLIST",
      "PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root '" + sanitizeLogText(normalizedRoot) +
        "' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path." +
        trustedParentsHint(),
      sanitizeLogText(normalizedRoot),
    );
  }
  const trimmed = rawPath.trim();
  const resolvedPath = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)                 // BR-04 — absolute passthrough
    : path.resolve(normalizedRoot, trimmed); // BR-02 — relative against base_dir
  if (!isPathWithinRoot(normalizedRoot, resolvedPath)) {
    return err(
      "PATH_REJECTED_OUTSIDE_ALLOWLIST",
      "PATH_REJECTED_OUTSIDE_ALLOWLIST: Resolved path '" + sanitizeLogText(resolvedPath) +
        "' is outside workspace root '" + sanitizeLogText(normalizedRoot) + "'",
      sanitizeLogText(trimmed),
    );
  }
  return {
    ok: true,
    resolvedPath,
    rootSource: "workspace",
    rootPath: normalizedRoot,
  };
}
