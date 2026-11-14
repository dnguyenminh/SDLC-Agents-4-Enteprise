/**
 * Report scoring helpers (pure) — split from report.generator.ts.
 *
 * SA4E-393 Addendum (user-approved 2026-11-09) — NORMALIZED SCORING:
 *   score = 1 − (unique files with significant findings / total files in scope)
 * SA4E-438 amendment: only HIGH/MEDIUM findings fail a file; LOW findings are
 * triage info. SECURITY-REVIEW C5: finding paths are workspace-relative only.
 */
import * as path from "path";
import { Finding } from "./types";
import { isPathWithinRoot } from "../services/PathResolver";

/** Severity histogram (triage info — not part of the score). */
export function buildBreakdown(findings: Finding[]): { low: number; medium: number; high: number } {
  const count = (sev: Finding["severity"]) => findings.filter((f) => f.severity === sev).length;
  return { low: count("low"), medium: count("medium"), high: count("high") };
}

/**
 * Cleanliness ratio of the scan scope, clamped to [0, 1].
 * Empty scope is a vacuous pass, surfaced through `message`.
 */
export function computeScore(findings: Finding[], totalFiles: number): { score: number; message?: string } {
  if (totalFiles <= 0) {
    return { score: 1.0, message: "No design artifacts found in scan scope (0 files)" };
  }
  const significant = findings.filter((f) => f.severity === "high" || f.severity === "medium");
  const flaggedFiles = new Set(significant.map((f) => f.file)).size;
  return { score: Math.max(0, Math.min(1, 1 - flaggedFiles / totalFiles)) };
}

/**
 * Sanitize a file path to workspace-relative form (C5).
 * @param workspaceRoot - explicit root (SEC-F08); never read from process env
 * @returns relative path, or "unknown" when it cannot be placed inside the root
 */
export function sanitizeFilePath(filePath: string, workspaceRoot: string): string {
  try {
    const root = path.resolve(workspaceRoot);
    const resolved = path.resolve(root, filePath);
    // Single containment implementation (PathResolver); a name like "..dots" is inside.
    if (!isPathWithinRoot(root, resolved)) return "unknown";
    return path.relative(root, resolved) || "unknown";
  } catch {
    return "unknown";
  }
}

/** Findings with every `file` made workspace-relative (C5). */
export function sanitizeFindings(findings: Finding[], workspaceRoot: string): Finding[] {
  return findings.map((finding) => ({ ...finding, file: sanitizeFilePath(finding.file, workspaceRoot) }));
}
