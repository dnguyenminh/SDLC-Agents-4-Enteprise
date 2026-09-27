/**
 * SEC-325-D1 — workspace containment for MCP-derived file paths.
 *
 * NOTE (TDD-vs-REVIEW): TDD SA4E-325 v1.0 is a 37-line skeleton with no
 * containment step, so this module follows SECURITY-REVIEW.md instead:
 * every candidate path (code_search AND mem_search — the latter is
 * agent-writable via mem_ingest, hence untrusted) is canonicalized with
 * realpath and rejected when it escapes realpath(rootDir).
 *
 * Disclosure invariant: context files SUBSET-OF realpath(rootDir).
 * ContextRetriever is the single choke-point enforcing it; disclosure and
 * extractor tiers MUST only receive already-filtered symbols.
 */
import * as fs from "fs";
import * as path from "path";

/** Resolve a candidate to a contained absolute path, or null when rejected. */
export function resolveContainedPath(rootDir: string, candidatePath: string): string | null {
  if (typeof candidatePath !== "string" || candidatePath.length === 0) return null;
  if (candidatePath.includes("\0")) return null;
  if (isUncPath(candidatePath)) return null;
  const base = path.resolve(rootDir);
  const joined = path.resolve(base, candidatePath);
  if (!isWithin(joined, base)) return null;
  return resolveSymlink(joined, base);
}

/** True when the candidate stays inside rootDir after canonicalization. */
export function isPathContained(rootDir: string, candidatePath: string): boolean {
  return resolveContainedPath(rootDir, candidatePath) !== null;
}

/**
 * Filter MCP-derived candidates to contained paths (order-preserving).
 * Applies equally to code_search and mem_search sources — mem_search output
 * is untrusted by default (KB entries are agent-writable).
 */
export function filterContainedCandidates<T extends { filePath: string }>(
  candidates: T[],
  rootDir: string,
): T[] {
  return (candidates ?? []).filter((c) => isPathContained(rootDir, c.filePath));
}

/** UNC paths (`\\share\...`) never belong to a workspace root. */
function isUncPath(p: string): boolean {
  return p.startsWith("\\\\") || p.startsWith("//");
}

/** Lexical containment: equal to base or under base + separator. */
function isWithin(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(base + path.sep);
}

/** Follow symlinks when the target exists; reject escapes, keep missing. */
function resolveSymlink(joined: string, base: string): string | null {
  let real: string;
  try {
    real = fs.realpathSync(joined);
  } catch {
    return joined; // Missing file: lexical containment already verified.
  }
  return isWithin(real, base) ? real : null;
}
