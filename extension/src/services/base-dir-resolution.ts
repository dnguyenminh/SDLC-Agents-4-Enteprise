/**
 * SA4E-394 — per-call base_dir resolution for extension-executed tools
 * (C-5 bundle boundary: the extension cannot import backend ESM modules, so
 * the contract is duplicated here and verified behaviorally by the shared
 * test matrix — TC-702 contract parity).
 *
 * Same normative order as the backend resolver: normalize (BR-09) → allowlist
 * (BR-05) → [SA4E-393 A5: UNC guard → worktree auto-trust] → resolve (BR-02/04)
 * → containment AFTER resolution (BR-07). Never throws.
 */
import * as path from "path";
import { sanitizeLogText, type PathResolutionErr, type PathResolutionResult } from "./PathResolver";
import { isPathWithinRoot } from "./PathResolver";
import { getExtensionWorkspaceRoots, isRootAllowlisted } from "./allowlist-mirror";
import { buildRejectionDetail } from "./worktree-trust/messages";
import { isUncOrDevice } from "./worktree-trust/path-fold";
import type { TrustPort, WorktreeReason } from "./worktree-trust/types";
import { getDefaultTrust } from "./worktree-open-folders";

// Allowlist mirror moved to ./allowlist-mirror (realpath parity, OI-WT2); API unchanged.
export { getExtensionWorkspaceRoots, isRootAllowlisted };

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

function err(code: PathResolutionErr["code"], message: string, rawPath: string): PathResolutionErr {
  return {
    ok: false, code, message,
    rawPath, resolvedPath: "", rootSource: null, rootPath: "",
  };
}

/** Where a base_dir's authority came from (additive field, `rootSource` is unchanged). */
type TrustSource = "allowlist" | "worktree";

/** Legacy-shaped rejection; `reason` selects the optional worktree hint (BR-WT10). */
function rejectBase(normalizedRoot: string, reason: WorktreeReason): PathResolutionErr {
  const shown = sanitizeLogText(normalizedRoot);
  return err("PATH_REJECTED_OUTSIDE_ALLOWLIST", "PATH_REJECTED_OUTSIDE_ALLOWLIST: " + buildRejectionDetail(shown, reason), shown);
}

/**
 * Allowlist first (always wins, BR-WT1) → UNC/device guard before any fs probe
 * (SEC-WT-2) → verified git worktree of a trusted repository.
 */
function admit(
  normalizedRoot: string, allowlist: ReadonlySet<string> | undefined, trust: TrustPort,
): TrustSource | PathResolutionErr {
  if (isRootAllowlisted(normalizedRoot, allowlist)) return "allowlist";
  if (isUncOrDevice(normalizedRoot, process.platform)) return rejectBase(normalizedRoot, "unc_unsupported");
  const verdict = trust.check(normalizedRoot);
  return verdict.trusted ? "worktree" : rejectBase(normalizedRoot, verdict.reason);
}

/**
 * base_dir branch — mirrors backend MultiWorktreePathResolver.resolveWithBaseDir.
 * Existence of the root is caller-side (backend stat); the extension performs
 * the allowlist/worktree check, resolution and containment.
 */
export function resolveWithBaseDir(
  rawPath: unknown,
  baseDir: string,
  opts?: { allowlist?: ReadonlySet<string>; worktreeTrust?: TrustPort },
): PathResolutionResult {
  if (typeof rawPath !== "string" || rawPath.trim() === "") {
    return err("PATH_EMPTY", "PATH_EMPTY: 'file_path' must be a non-empty string.", "");
  }
  if (rawPath.includes("\0")) {
    return err("PATH_INVALID", "PATH_INVALID: 'file_path' contains invalid characters (NUL byte).", sanitizeLogText(rawPath));
  }
  const normalizedRoot = path.resolve(baseDir.trim()); // BR-09 before allowlist (T8)
  const admitted = admit(normalizedRoot, opts?.allowlist, opts?.worktreeTrust ?? getDefaultTrust());
  if (typeof admitted !== "string") return admitted;
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
  return { ok: true, resolvedPath, rootSource: "workspace", rootPath: normalizedRoot, trustSource: admitted };
}
