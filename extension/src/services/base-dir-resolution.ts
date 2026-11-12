/**
 * SA4E-394 — per-call base_dir resolution for extension-executed tools
 * (C-5 bundle boundary: the extension cannot import backend ESM modules, so
 * the contract is duplicated here and verified behaviorally by the shared
 * test matrix — TC-702 contract parity).
 *
 * Same normative order as the backend resolver: normalize (BR-09) → allowlist
 * (BR-05) → resolve (BR-02/04) → containment AFTER resolution (BR-07).
 * Pure string ops + fs.existsSync for the allowlist path — NEVER throws.
 */
import * as path from "path";
import * as fs from "fs";
import { sanitizeLogText, type PathResolutionErr, type PathResolutionResult } from "./PathResolver";
import { isPathWithinRoot } from "./PathResolver";

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
 * Allowlist mirror (TDD §6.3): VS Code setting `sdlcAgents.workspace.workspaceRoots`
 * (string[]), falling back to the MCP_WORKSPACE_ROOTS env var. Backend remains
 * the source of truth — deployments configure both from the same values (DPG §6.1).
 */
export function getExtensionWorkspaceRoots(): ReadonlySet<string> {
  const fromSetting = readSettingRoots();
  const raw = fromSetting.length > 0 ? fromSetting : readEnvRoots();
  const roots = new Set<string>();
  for (const entry of raw) {
    const resolved = path.resolve(entry.trim());
    if (resolved === "" || entry.trim() === "") continue;
    roots.add(foldKey(resolved));
  }
  return roots;
}

function readSettingRoots(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require("vscode");
    const cfg = vscode?.workspace?.getConfiguration?.("sdlcAgents.workspace");
    const value = cfg?.get?.("workspaceRoots");
    return Array.isArray(value) ? value.filter((v: unknown): v is string => typeof v === "string") : [];
  } catch (e: any) {
    // Catch ALL errors including ReferenceError
    console.debug(`[base-dir-resolution] vscode require failed: ${e?.message ?? e}`);
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
 * Existence of the root is caller-side (backend stat); the extension performs
 * the allowlist check, resolution and containment on pure strings.
 */
export function resolveWithBaseDir(
  rawPath: unknown,
  baseDir: string,
  opts?: { allowlist?: ReadonlySet<string> },
): PathResolutionResult {
  if (typeof rawPath !== "string" || rawPath.trim() === "") {
    return err("PATH_EMPTY", "PATH_EMPTY: 'file_path' must be a non-empty string.", "");
  }
  if (rawPath.includes("\0")) {
    return err("PATH_INVALID", "PATH_INVALID: 'file_path' contains invalid characters (NUL byte).", sanitizeLogText(rawPath));
  }
  const normalizedRoot = path.resolve(baseDir.trim()); // BR-09 before allowlist (T8)
  if (!isRootAllowlisted(normalizedRoot, opts?.allowlist)) {
    return err(
      "PATH_REJECTED_OUTSIDE_ALLOWLIST",
      "PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root '" + sanitizeLogText(normalizedRoot) +
        "' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path.",
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
