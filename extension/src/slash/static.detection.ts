/**
 * Static design detection (UC-002, BR-04..06): cache lookup, workspace-scoped
 * file listing (C3), per-file analysis and report generation. The workspace
 * root is an explicit parameter (SEC-F08) — nothing here reads process env.
 */
import * as fs from "fs";
import * as path from "path";

import { DetectionError, DetectionResult, Finding, QualityReport, DEFAULT_THRESHOLD, createDetectionError } from "./types";
import { StaticOptions } from "./detection.types";
import { DetectorRuntime } from "./detector.runtime";
import { listSourceFiles, readSourceFile, isPathSafe } from "./fs.adapter";
import { generateQualityReport } from "./report.generator";
import { cacheResult, getCachedResult } from "./detection.cache";
import { friendlyError } from "./error-text";
import { logRedacted } from "./path-redactor";

/** Max files scanned per run (TDD/DPG). */
const MAX_FILES = 10000;

/** Outcome of a static run; `sourceRunId` is set on a cache hit. */
export interface StaticOutcome { result: DetectionResult; report: QualityReport; sourceRunId?: string }

function emptyResult(): DetectionResult {
  return { findings: [], fileCount: 0, durationMs: 0, cacheHit: false, partial: false };
}

/** AF-2: fresh cached findings; F-2: entries without a real fileCount are a miss (no false PASS). */
function fromCache(root: string, sourcePath: string, threshold: number): StaticOutcome | undefined {
  const hit = getCachedResult(root, sourcePath, "static");
  const cached = hit?.result;
  if (!hit || !cached || typeof cached.fileCount !== "number") return undefined;
  const result: DetectionResult = {
    findings: cached.findings, fileCount: cached.fileCount,
    durationMs: cached.durationMs || 0, cacheHit: true, partial: false,
  };
  const report = generateQualityReport(cached.findings, "static", threshold, undefined, cached.fileCount, root);
  return { result, report, sourceRunId: hit.runId };
}

/** C3: the source path must exist and stay inside the workspace root. */
function assertScannable(root: string, sourcePath: string): void {
  if (!isPathSafe(sourcePath, root)) {
    throw createDetectionError(DetectionError.INVALID_PATH, "Source path escapes workspace root");
  }
  if (!fs.existsSync(sourcePath)) {
    throw createDetectionError(DetectionError.INVALID_PATH,
      `Source path does not exist: ${path.relative(root, sourcePath)}`);
  }
}

/** Analyze one file; C6: a per-file error is logged and the file skipped. */
async function analyzeFile(rt: DetectorRuntime, root: string, file: string): Promise<Finding[]> {
  try {
    // SA4E-438: pass the file path — rules are extension-aware.
    const analysis = await rt.wasm!.analyze(readSourceFile(file, root), "static", file);
    return analysis.findings.map((f) => ({
      findingId: f.findingId, runId: rt.instanceId || "", mode: "static" as const, file,
      severity: f.severity, message: f.message, line: f.line, column: f.column,
    }));
  } catch (fileError: any) {
    logRedacted("error", `Error analyzing file ${file}: ${fileError.message}`, root);
    return [];
  }
}

async function scanSource(rt: DetectorRuntime, root: string, sourcePath: string): Promise<DetectionResult> {
  const files = await listSourceFiles(sourcePath, { maxFiles: MAX_FILES, workspaceRoot: root });
  if (files.length === 0) return emptyResult();
  const started = Date.now();
  const findings: Finding[] = [];
  for (const file of files) findings.push(...(await analyzeFile(rt, root, file)));
  return { findings, fileCount: files.length, durationMs: Date.now() - started, cacheHit: false, partial: false };
}

/** C6: error wrapping — score 0, fail, sanitized message. */
function failure(error: any, root: string, threshold: number): StaticOutcome {
  const message = friendlyError(error, root);
  logRedacted("error", `Static detection error: ${message}`, root);
  const report = generateQualityReport([], "static", threshold, undefined, 0, root);
  report.score = 0;
  report.pass = false;
  report.message = message;
  return { result: emptyResult(), report };
}

/**
 * Static detection without persisting the audit record (the facade persists).
 * @param rt - loaded detector runtime
 * @param root - explicit workspace root (containment, cache, redaction)
 */
export async function runStaticCore(
  rt: DetectorRuntime, root: string, sourcePath: string, config: StaticOptions
): Promise<StaticOutcome> {
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  try {
    const cacheReuse = config.cacheReuse ?? true;
    const cached = cacheReuse ? fromCache(root, sourcePath, threshold) : undefined;
    if (cached) return cached;
    assertScannable(root, sourcePath);
    const result = await scanSource(rt, root, sourcePath);
    const report = generateQualityReport(result.findings, "static", threshold, undefined, result.fileCount, root);
    if (cacheReuse) cacheResult(root, sourcePath, "static", result, report.runId);
    return { result, report };
  } catch (error: any) {
    return failure(error, root, threshold);
  }
}
