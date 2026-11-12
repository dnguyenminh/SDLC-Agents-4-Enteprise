/**
 * Full detection (UC-004): dispatch on detection mode and merge static +
 * rendered results into one report. Static / rendered runs are injected
 * (`FullOps`) so each keeps its own audit-record persistence.
 */
import { DetectionError, Finding, QualityReport, DetectionConfig, DEFAULT_THRESHOLD, createDetectionError } from "./types";
import { CombinedResult, RenderedDetectionResult, StaticOptions, RenderedOptions } from "./detection.types";
import { shouldSkipRendered } from "./localhost-fetcher";
import { generateQualityReport } from "./report.generator";
import { friendlyError } from "./error-text";
import { logRedacted } from "./path-redactor";
import type { DetectionResult } from "./types";

type Static = { result: DetectionResult; report: QualityReport };
type Rendered = { result: RenderedDetectionResult; report: QualityReport };
type Full = { result: CombinedResult; report: QualityReport };

/** Persisting static / rendered runs supplied by the facade. */
export interface FullOps {
  runStatic(sourcePath: string, config: StaticOptions): Promise<Static>;
  runRendered(localhostUrl: string, urls: string[], config: RenderedOptions): Promise<Rendered>;
}

/** Static + rendered → one combined result and one normalized report. */
function mergeBoth(s: Static, r: Rendered, threshold: number, root: string): Full {
  const findings: Finding[] = [...s.result.findings, ...r.result.findings];
  const result: CombinedResult = {
    findings,
    fileCount: s.result.fileCount,
    durationMs: s.result.durationMs + r.result.durationMs,
    cacheHit: s.result.cacheHit || r.result.cacheHit,
    partial: s.result.partial || r.result.partial,
  };
  // One cleanliness ratio over the full scope (static files + rendered page when fetched).
  const scope = s.result.fileCount + (r.result.pagesFetched > 0 ? 1 : 0);
  return { result, report: generateQualityReport(findings, "both", threshold, undefined, scope, root) };
}

/** Static first; the circuit breaker may skip the rendered half. */
async function runBoth(
  ops: FullOps, root: string, sourcePath: string, url: string, urls: string[], threshold: number
): Promise<Full> {
  const opts = { threshold, workspaceRoot: root };
  const staticRun = await ops.runStatic(sourcePath, opts);
  if (shouldSkipRendered()) {
    logRedacted("warn", "Rendered detection skipped due to circuit breaker", root);
    const report = generateQualityReport(
      staticRun.result.findings, "static", threshold, undefined, staticRun.result.fileCount, root);
    return { result: staticRun.result, report };
  }
  return mergeBoth(staticRun, await ops.runRendered(url, urls, opts), threshold, root);
}

async function dispatch(
  ops: FullOps, root: string, sourcePath: string, url: string, urls: string[], config: DetectionConfig
): Promise<Full> {
  const mode = config.detectionMode ?? "both";
  const opts = { threshold: config.threshold ?? DEFAULT_THRESHOLD, workspaceRoot: root };
  if (mode === "static") return ops.runStatic(sourcePath, opts);
  if (mode === "rendered") return ops.runRendered(url, urls, opts);
  if (mode === "both") return runBoth(ops, root, sourcePath, url, urls, opts.threshold);
  throw createDetectionError(DetectionError.INVALID_PATH, `Unknown detection mode: ${mode}`);
}

/** C6: fail-open inconclusive report. */
function failOpen(error: any, root: string, threshold: number): Full {
  const message = friendlyError(error, root);
  logRedacted("error", `Full detection error: ${message}`, root);
  const report = generateQualityReport([], "static", threshold, undefined, 0, root);
  report.score = 0;
  report.pass = true;
  report.message = message;
  const result = { findings: [], fileCount: 0, durationMs: 0, cacheHit: false, partial: false };
  return { result, report };
}

/**
 * Full detection without the final persist guard (the facade adds it).
 * @param root - explicit workspace root
 */
export async function runFullCore(
  ops: FullOps, root: string, sourcePath: string, localhostUrl: string, urls: string[], config: DetectionConfig
): Promise<Full> {
  try {
    return await dispatch(ops, root, sourcePath, localhostUrl, urls, config);
  } catch (error: any) {
    return failOpen(error, root, config.threshold ?? DEFAULT_THRESHOLD);
  }
}
