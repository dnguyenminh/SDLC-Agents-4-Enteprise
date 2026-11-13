/**
 * SA4E-394 / SA4E-393 Addendum 5 — extension mirror of the backend workspace allowlist.
 * VS Code setting `sdlcAgents.workspace.workspaceRoots` (string[]), falling back to the
 * MCP_WORKSPACE_ROOTS env var. Backend remains the source of truth — deployments
 * configure both from the same values (DPG §6.1).
 *
 * OI-WT2 (realpath parity): every entry is stored under its resolved AND real spelling,
 * and a candidate is matched by resolved key then by realpath, exactly like the backend
 * `WorkspaceAllowlist.contains`. UNC/device candidates are never realpath-ed (SEC-WT-2).
 */
import * as path from "path";
import * as fs from "fs";
import { foldKey as foldFor, isUncOrDevice } from "./worktree-trust/path-fold";

/** Allowlist keys are case-folded on win32 (backend P7 semantics). */
function foldKey(p: string): string {
  return foldFor(p, process.platform);
}

interface Snapshot { cacheKey: string; keys: ReadonlySet<string>; roots: readonly string[] }
let cached: Snapshot | null = null;

/** Raw configured entries: setting first, env fallback. */
function readRawEntries(): string[] {
  const fromSetting = readSettingRoots();
  return fromSetting.length > 0 ? fromSetting : readEnvRoots();
}

/** Realpath of an existing, non-UNC entry; null when unavailable (ENOENT etc. is expected here). */
function realOrNull(resolved: string): string | null {
  if (isUncOrDevice(resolved, process.platform)) return null;
  try {
    return fs.realpathSync(resolved);
  } catch (e: any) {
    console.debug(`[allowlist-mirror] realpath unavailable for allowlist entry: ${e?.code ?? e?.message}`);
    return null;
  }
}

function buildSnapshot(raw: string[], cacheKey: string): Snapshot {
  const keys = new Set<string>();
  const roots: string[] = [];
  const add = (p: string): void => {
    if (!keys.has(foldKey(p))) { keys.add(foldKey(p)); roots.push(p); }
  };
  for (const entry of raw) {
    if (entry.trim() === "") continue;
    const resolved = path.resolve(entry.trim());
    add(resolved);
    const real = realOrNull(resolved);
    if (real !== null) add(real);
  }
  return { cacheKey, keys, roots };
}

/** Realpaths are computed once per distinct setting/env string (E11.2). */
function snapshot(): Snapshot {
  const raw = readRawEntries();
  const cacheKey = JSON.stringify(raw);
  if (cached === null || cached.cacheKey !== cacheKey) cached = buildSnapshot(raw, cacheKey);
  return cached;
}

/** Folded allowlist keys (resolved + real spelling of every configured root). */
export function getExtensionWorkspaceRoots(): ReadonlySet<string> {
  return snapshot().keys;
}

/** Unfolded absolute roots (resolved + real) — enumerated by the worktree trusted-prefix gate. */
export function getExtensionAllowlistRoots(): readonly string[] {
  return snapshot().roots;
}

function readSettingRoots(): string[] {
  try {
    const vscode = require("vscode");
    const cfg = vscode?.workspace?.getConfiguration?.("sdlcAgents.workspace");
    const value = cfg?.get?.("workspaceRoots");
    return Array.isArray(value) ? value.filter((v: unknown): v is string => typeof v === "string") : [];
  } catch (e: any) {
    // Catch ALL errors including ReferenceError
    console.debug(`[allowlist-mirror] vscode require failed: ${e?.message ?? e}`);
    return []; // non-extension-host context (tests) — env fallback applies
  }
}

function readEnvRoots(): string[] {
  const raw = process.env["MCP_WORKSPACE_ROOTS"];
  if (!raw) return [];
  return raw.split(path.delimiter);
}

/** True when the normalized root (or its realpath) is registered in the allowlist mirror. */
export function isRootAllowlisted(normalizedRoot: string, allowlist?: ReadonlySet<string>): boolean {
  const set = allowlist ?? getExtensionWorkspaceRoots();
  if (set.size === 0) return false;
  const resolved = path.resolve(normalizedRoot);
  if (set.has(foldKey(resolved))) return true;
  const real = realOrNull(resolved); // UNC/device never reaches realpath (OI-WT2 guard)
  return real !== null && set.has(foldKey(real));
}
