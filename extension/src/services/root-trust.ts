/**
 * root-trust — SA4E-406 A7: trust a declared root by PARENTS, not per-repo
 * roots (anti-hardcode). A declared session root (A6) or a per-call
 * base_dir/workspace_root is ADMITTED only when it is an existing directory
 * AND satisfies one of:
 *   (a) equals or sits under a configured trusted parent — VS Code setting
 *       `sdlcAgents.workspace.workspaceRootParents` (string[]) with env
 *       fallback `MCP_WORKSPACE_ROOT_PARENTS` (same delimiter as readEnvRoots);
 *   (b) equals or sits under an open `vscode.workspace.workspaceFolders` path;
 *   (c) is already registered in the allowlist (`workspaceRoots` /
 *       `MCP_WORKSPACE_ROOTS`) — checked FIRST, existence-free, so configured
 *       roots keep their pre-A7 behaviour byte-for-byte.
 *
 * RATIONALE (encoded per A7): a parent covers every future worktree under it
 * with ONE config entry; containment + symlink guards still apply INSIDE the
 * admitted root; the admitted scope equals what the caller's own session could
 * already touch — no new privilege. Never throws (C-1); fs use is the same
 * class as the allowlist mirror's fs.existsSync.
 */
import * as fs from "fs";
import * as path from "path";
import { foldPathKey, isPathWithinRoot, sameRoot } from "./path-containment";
import { allWorkspaceFolderRoots } from "./workspace-roots";
import { getExtensionWorkspaceRoots } from "./base-dir-resolution";
import { sanitizeLogText } from "./path-format";

/** Which A7 rule admitted a declared root (bind-time audit — A6). */
export type RootTrustSource = "allowlist" | "parent" | "workspace_folder";

/** Trusted parents = setting `workspaceRootParents` ∪ env, resolved, per call. */
export function trustedParentRoots(): string[] {
  const out: string[] = [];
  for (const entry of [...readSettingParents(), ...readEnvParents()]) {
    if (typeof entry !== "string" || entry.trim() === "") continue;
    const resolved = path.resolve(entry.trim());
    if (!out.some((p) => sameRoot(p, resolved))) out.push(resolved);
  }
  return out;
}

function readSettingParents(): unknown[] {
  try {
    const vscode = require("vscode");
    const cfg = vscode?.workspace?.getConfiguration?.("sdlcAgents.workspace");
    const value = cfg?.get?.("workspaceRootParents");
    return Array.isArray(value) ? value : [];
  } catch {
    return []; // non-extension-host context (tests) — env fallback applies
  }
}

function readEnvParents(): string[] {
  const raw = process.env["MCP_WORKSPACE_ROOT_PARENTS"];
  if (!raw) return [];
  return raw.split(path.delimiter);
}

/** A7 precondition — the declared root must exist and be a directory. */
export function isExistingDirectory(normalizedRoot: string): boolean {
  try {
    return fs.statSync(normalizedRoot).isDirectory();
  } catch {
    return false;
  }
}

function underAny(root: string, candidates: string[]): boolean {
  return candidates.some((c) => isPathWithinRoot(c, root));
}

/**
 * A7 admission check for a normalized root. `(c)` runs first (allowlist keeps
 * its historical existence-free semantics); the parents/folders branches
 * require an existing directory. `sessionRoot` (already admitted at bind
 * time) is admitted by equality. Injected `allowlist` (tests) wins over the
 * live mirror.
 */
export function isRootAdmitted(
  normalizedRoot: string,
  allowlist?: ReadonlySet<string>,
  sessionRoot?: string,
): boolean {
  const set = allowlist ?? getExtensionWorkspaceRoots();
  if (set.size > 0 && set.has(foldPathKey(normalizedRoot))) return true; // (c)
  if (sessionRoot && sameRoot(sessionRoot, normalizedRoot)) return true; // A6
  if (!isExistingDirectory(normalizedRoot)) return false;
  if (underAny(normalizedRoot, trustedParentRoots())) return true; // (a)
  if (underAny(normalizedRoot, allWorkspaceFolderRoots())) return true; // (b)
  return false;
}

/** Bind-time admission of a DECLARED root → which rule admitted it, or error. */
export function admitDeclaredRoot(
  rawRoot: string,
): { ok: true; normalized: string; trustSource: RootTrustSource } | { ok: false; message: string } {
  const normalized = path.resolve(rawRoot.trim());
  const set = getExtensionWorkspaceRoots();
  if (set.size > 0 && set.has(foldPathKey(normalized))) return { ok: true, normalized, trustSource: "allowlist" };
  if (!isExistingDirectory(normalized)) {
    return { ok: false, message: untrustedRootMessage(normalized) };
  }
  if (underAny(normalized, trustedParentRoots())) return { ok: true, normalized, trustSource: "parent" };
  if (underAny(normalized, allWorkspaceFolderRoots())) {
    return { ok: true, normalized, trustSource: "workspace_folder" };
  }
  return { ok: false, message: untrustedRootMessage(normalized) };
}

/**
 * Actionable A7 rejection — names the configured parents (sanitized) so the
 * caller can fix the config in ONE entry instead of per-worktree roots.
 */
export function untrustedRootMessage(normalizedRoot: string): string {
  const parents = trustedParentRoots();
  const hint = parents.length > 0
    ? ` Trusted parents configured: ${parents.map((p) => sanitizeLogText(p)).join("; ")}.`
    : " No trusted parents configured — set sdlcAgents.workspace.workspaceRootParents.";
  return (
    `PATH_REJECTED_OUTSIDE_ALLOWLIST: Declared workspace root '${sanitizeLogText(normalizedRoot)}' is not ` +
    "trusted: not inside the workspaceRoots allowlist, not under an open workspace folder, " +
    "and not under a configured trusted parent." + hint
  );
}

/**
 * base_dir rejection extension (A7, extend-don't-break): the legacy
 * "not registered in the allowlist" message stays byte-identical when NO
 * parents are configured; with parents configured, name them so the caller
 * sees the ONE entry that would admit the root.
 */
export function trustedParentsHint(): string {
  const parents = trustedParentRoots();
  if (parents.length === 0) return "";
  return ` Trusted parents configured: ${parents.map((p) => sanitizeLogText(p)).join("; ")} — base_dir must equal or sit under one.`;
}
