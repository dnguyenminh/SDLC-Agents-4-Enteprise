/**
 * Report Generator
 *
 * Aggregates findings from static and rendered detection, calculates the
 * quality score (0-1, see report.scoring.ts) and decides pass/fail against
 * the configured threshold.
 *
 * SECURITY-REVIEW.md Conditions C5-C6:
 * - C5: finding paths are workspace-relative only (explicit root, SEC-F08)
 * - C6: any failure yields a minimal inconclusive report, never a raw error
 */

import { DetectionError, Finding, QualityReport, EnvConfig, DetectionRun } from "./types";
import { generateId } from "./utils";
import { logRedacted } from "./path-redactor";
import { requireWorkspaceRoot } from "./path-guard";
import { buildBreakdown, computeScore, sanitizeFindings } from "./report.scoring";

type Mode = "static" | "rendered" | "both";

const DEFAULT_THRESHOLD = parseFloat(process.env[EnvConfig.QUALITY_GATE_THRESHOLD] || "0.8");

/** Fresh runId (run_<ms>_<id>) — the only shape report.store accepts. */
function newRunId(): string {
  return `run_${Date.now()}_${generateId(8)}`;
}

/** BR-11: score >= threshold passes. */
function isPassing(score: number, threshold: number): boolean {
  return score >= threshold;
}

/** Assemble the report object once score and threshold are known. */
function assembleReport(
  findings: Finding[], mode: Mode, threshold: number, runId: string | undefined,
  totalFiles: number, workspaceRoot: string,
): QualityReport {
  const { score, message } = computeScore(findings, totalFiles);
  const report: QualityReport = {
    runId: runId || newRunId(),
    detectionMode: mode,
    threshold,
    score: Number(score.toFixed(4)), // 4 decimal places
    pass: isPassing(score, threshold),
    timestamp: new Date().toISOString(),
    findings: sanitizeFindings(findings, workspaceRoot),
    totalIssues: findings.length,
    severityBreakdown: buildBreakdown(findings),
    fileCount: totalFiles,
  };
  if (message) report.message = message;
  return report;
}

/** C6: minimal inconclusive report; the raw error stays out of the report. */
function errorReport(runId: string | undefined): QualityReport {
  return {
    // S-1: always a RUN_ID_RE-valid id so the inconclusive run still gets an audit record.
    runId: runId || newRunId(),
    detectionMode: "static",
    threshold: DEFAULT_THRESHOLD,
    score: 0,
    pass: true, // fail-open by default
    timestamp: new Date().toISOString(),
    findings: [],
    totalIssues: 0,
    severityBreakdown: { low: 0, medium: 0, high: 0 },
  };
}

/**
 * Aggregate findings of static/rendered runs into a quality gate report
 * (BR-10/11/12; normalized scoring in report.scoring.ts).
 *
 * @param findings - all findings (static + rendered)
 * @param mode - detection mode
 * @param threshold - quality threshold (0-1); defaults to QUALITY_GATE_THRESHOLD
 * @param runId - run identifier; generated when omitted
 * @param totalFiles - files in the scan scope (denominator of the score)
 * @param workspaceRoot - explicit root used to relativise finding paths (C5)
 */
export function generateQualityReport(
  findings: Finding[],
  mode: Mode,
  threshold: number | undefined,
  runId: string | undefined,
  totalFiles: number,
  workspaceRoot: string,
): QualityReport {
  // Outside the try: a missing root is a caller bug, not an inconclusive run (C6).
  requireWorkspaceRoot(workspaceRoot);
  try {
    return assembleReport(findings, mode, threshold ?? DEFAULT_THRESHOLD, runId, totalFiles, workspaceRoot);
  } catch (error: any) {
    logRedacted("error", `Report generation error: ${error.message}`, workspaceRoot);
    return errorReport(runId);
  }
}

/**
 * Determine pass/fail for the quality gate (BR-11; C6 fail-open configurable).
 * @param failOpen - when true, always passes (TDD §10.1)
 */
export function determinePassFail(score: number, threshold?: number, failOpen: boolean = false): boolean {
  if (failOpen) return true;
  if (isNaN(score)) {
    console.error("Score calculation failed - returning fail-open");
    return failOpen;
  }
  return isPassing(score, threshold ?? DEFAULT_THRESHOLD);
}

/** Create a DetectionRun entity from a QualityReport (FSD §4.2). */
export function createDetectionRun(report: QualityReport, userId: string): DetectionRun {
  return {
    runId: report.runId,
    detectionMode: report.detectionMode,
    threshold: report.threshold,
    score: report.score,
    pass: report.pass,
    createdAt: report.timestamp,
    userId,
    findings: report.findings.map((f) => ({
      findingId: f.findingId,
      runId: report.runId,
      mode: f.mode,
      file: f.file,
      severity: f.severity,
      message: f.message,
      line: f.line,
    })),
  };
}

// Export enum for tests
export { DetectionError };

// Re-export EnvConfig for convenience in this module
export { EnvConfig };
