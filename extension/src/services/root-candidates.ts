/**
 * root-candidates — SA4E-406 F2/A8 multi-root selection for relative paths.
 *
 * Kills the stale-`workspaceFolders[0]` failure class: instead of blindly
 * resolving against folder[0] (a stale checkout → ENOENT or, worse, a silent
 * read of the WRONG copy), the tool layer feeds an ORDERED candidate list
 * (first = preferred) and the resolver picks the first candidate whose
 * containment holds. PathResolver stays pure string ops — whether the
 * provider probes fs existence is the CALLER's decision (its header contract).
 *
 * Pure functions (normalize/firstContaining/resolveVia) never throw;
 * the fs-probing helper is tool-layer side (existingRelativeCandidates).
 */
import * as fs from "fs";
import * as path from "path";
import { foldPathKey, isPathWithinRoot, sameRoot } from "./path-containment";
import { sanitizeLogText } from "./path-format";
import type { PathResolutionOk, PathResolutionResult } from "./PathResolver";

/** Ordered candidate roots (first = preferred). May probe fs — caller decides. */
export type RootCandidatesProvider = () => string[];

/** First candidate whose containment holds (pure — no fs, never throws). */
export interface CandidateHit {
  rootPath: string;
  resolvedPath: string;
  index: number;
}

/** Normalize a provider into resolved, trimmed, deduped candidate roots. */
export function normalizeCandidateRoots(provider: RootCandidatesProvider | undefined): string[] {
  if (typeof provider !== "function") return [];
  let raw: unknown;
  try {
    raw = provider(); // throwing provider degrades to no candidates (C-1)
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.trim() === "") continue;
    const resolved = path.resolve(entry.trim());
    if (!out.some((r) => foldPathKey(r) === foldPathKey(resolved))) out.push(resolved);
  }
  return out;
}

/** Iterate candidates in order — first root containing the path wins. */
export function firstContainingCandidate(trimmedPath: string, candidates: string[]): CandidateHit | null {
  const absolute = path.isAbsolute(trimmedPath);
  for (let i = 0; i < candidates.length; i++) {
    const rootPath = path.resolve(candidates[i]);
    const resolvedPath = absolute
      ? path.resolve(trimmedPath)
      : path.resolve(rootPath, trimmedPath);
    if (isPathWithinRoot(rootPath, resolvedPath)) return { rootPath, resolvedPath, index: i };
  }
  return null;
}

/**
 * F2/A8 resolution through the candidate list. Returns null when there is
 * nothing to iterate or no candidate contains the path — the caller then
 * falls back to the legacy single-root behaviour.
 */
export function resolveViaCandidates(
  trimmed: string,
  provider: RootCandidatesProvider | undefined,
  sessionRoot?: string,
): PathResolutionResult | null {
  const candidates = normalizeCandidateRoots(provider);
  if (candidates.length === 0) return null;
  const hit = firstContainingCandidate(trimmed, candidates);
  if (!hit) return null;
  return {
    ok: true,
    resolvedPath: hit.resolvedPath,
    rootPath: hit.rootPath,
    // A6 — a pick landing on the bound session root is labelled "session".
    rootSource: sessionRoot && sameRoot(sessionRoot, hit.rootPath) ? "session" : "workspace_candidate",
    candidateIndex: hit.index,
    candidatesProbed: candidates,
  };
}

/**
 * A8(1) — the bound session root is the FIRST candidate: containment gate
 * only, NO existence probe (new-file writes must land inside the session
 * root). Containment failure → null → probed folder candidates ("else next").
 */
export function sessionGateHit(trimmed: string, sessionRoot: string): PathResolutionOk | null {
  if (sessionRoot.trim() === "") return null;
  const rootPath = path.resolve(sessionRoot.trim());
  const resolvedPath = path.resolve(rootPath, trimmed);
  if (!isPathWithinRoot(rootPath, resolvedPath)) return null;
  return {
    ok: true,
    resolvedPath,
    rootSource: "session",
    rootPath,
    candidateIndex: 0,
    candidatesProbed: [rootPath],
  };
}

/**
 * Tool-layer side (READ flows): keep only candidates where the relative path
 * EXISTS, preserving VS Code/allowlist order. Writes must NOT be gated on
 * existence — they use the session gate / legacy root instead.
 */
export function existingRelativeCandidates(relativePath: string, roots: string[]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    if (typeof root !== "string" || root.trim() === "") continue;
    const resolved = path.resolve(root.trim());
    if (out.some((r) => foldPathKey(r) === foldPathKey(resolved))) continue;
    try {
      if (fs.existsSync(path.resolve(resolved, relativePath))) out.push(resolved);
    } catch {
      /* probe is best-effort — a throwing fs degrades to no candidate */
    }
  }
  return out;
}

/**
 * F3 — actionable not-found error naming every probed root (sanitized).
 * Emitted by tool wrappers when a relative path was probed against candidate
 * roots and still could not be read.
 */
export function formatPathNoCandidate(rawRelative: string, candidateRoots: string[]): string {
  const roots = candidateRoots.map((r) => sanitizeLogText(r)).join("; ");
  return (
    `PATH_NO_CANDIDATE: '${sanitizeLogText(rawRelative)}' not found under any of ` +
    `${candidateRoots.length} candidate roots: ${roots}. Use base_dir or an absolute path.`
  );
}

/**
 * F5 — ONE audit line (the tools' existing console.warn pattern) whenever a
 * relative path resolves outside the legacy folders[0] flow: a candidate pick
 * (root + chosen index recorded — index 0 records folder[0] chosen), a session
 * pick, or a cwd_fallback. No logging framework.
 */
export function logCandidateResolution(
  toolName: string,
  resolution: PathResolutionOk,
  totalCandidates: number,
): void {
  if (resolution.rootSource === "workspace") return; // legacy folders[0] — no line
  if (resolution.rootSource === "cwd_fallback") {
    console.warn(
      `[PathResolver] ${toolName}: resolved on cwd_fallback root ` +
        `${sanitizeLogText(resolution.rootPath)} (rootSource=cwd_fallback)`,
    );
    return;
  }
  console.warn(
    `[PathResolver] ${toolName}: resolved via rootSource=${resolution.rootSource} ` +
      `candidate #${resolution.candidateIndex ?? "?"}/${totalCandidates} root ` +
      `${sanitizeLogText(resolution.rootPath)}`,
  );
}
