/**
 * Path containment — trailing-separator-safe prefix compare (UC-03 EF-2).
 * Extracted from PathResolver.ts (SA4E-406) to keep the 200-line budget and
 * to give candidate/trust modules a cycle-free import target.
 * Pure string ops — NO I/O, NEVER throws (C-1, C-2).
 */
import * as path from "path";

/**
 * Containment check — `candidate` equals or sits under `root`.
 * The trailing-separator compare blocks prefix collisions (C:\ws vs C:\ws-evil).
 */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const sep = path.sep;
  const rootNorm = path.normalize(root);
  const rootWithSep = rootNorm.endsWith(sep) ? rootNorm : rootNorm + sep; // UC-03 EF-2
  const candNorm = path.normalize(candidate);
  return (
    foldPathKey(candNorm).startsWith(foldPathKey(rootWithSep)) ||
    foldPathKey(candNorm) === foldPathKey(rootNorm)
  );
}

/** Allowlist/candidate keys are case-folded on win32 (backend P7 semantics). */
export function foldPathKey(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

/** Case-insensitive (win32) root equality after normalization. */
export function sameRoot(a: string, b: string): boolean {
  return foldPathKey(path.resolve(a)) === foldPathKey(path.resolve(b));
}
