/**
 * Rendered design detection (UC-003, BR-07..09, C4 SSRF protection):
 * fetch a localhost page, analyze its HTML, build the report.
 */
import { DetectionError, Finding, QualityReport, DEFAULT_THRESHOLD, createDetectionError } from "./types";
import { RenderedDetectionResult, RenderedOptions } from "./detection.types";
import { DetectorRuntime } from "./detector.runtime";
import { fetchLocalhostPage, shouldSkipRendered, resetCircuitBreaker, isLocalhostUrl } from "./localhost-fetcher";
import { generateQualityReport } from "./report.generator";
import { friendlyError } from "./error-text";
import { logRedacted } from "./path-redactor";

type Outcome = { result: RenderedDetectionResult; report: QualityReport };

/** Empty rendered outcome with the given fetch status (skipped / failed). */
function emptyOutcome(fetchStatus: string, threshold: number, root: string): Outcome {
  return {
    result: {
      findings: [], fileCount: 0, durationMs: 0, cacheHit: false, partial: false,
      score: 0, fetchStatus, pagesFetched: 0,
    },
    report: generateQualityReport([], "rendered", threshold, undefined, 0, root),
  };
}

/** C4: only 127.0.0.1 / localhost dev servers may be fetched. */
function assertLocalhost(url: string): void {
  if (!isLocalhostUrl(url)) {
    throw createDetectionError(DetectionError.DEV_SERVER_UNREACHABLE,
      `SSRF protection: localhost URL must be 127.0.0.1 or localhost, got: ${url}`);
  }
}

/** Analyze fetched HTML with the HTML rule set (C2: runtime must be loaded). */
async function analyzePage(
  rt: DetectorRuntime, html: string, threshold: number, root: string, started: number
): Promise<Outcome> {
  if (!rt.wasm) {
    throw createDetectionError(DetectionError.WASM_INCOMPATIBLE,
      "Detector runtime not loaded — call loadDetector() first");
  }
  const analysis = await rt.wasm.analyze(html, "rendered", "rendered-page.html");
  const findings: Finding[] = analysis.findings.map((f) => ({
    findingId: f.findingId, runId: rt.instanceId || "", mode: "rendered" as const,
    file: "rendered-page", severity: f.severity, message: f.message, line: f.line, column: f.column,
  }));
  return {
    result: {
      findings, fileCount: 0, durationMs: Date.now() - started, cacheHit: false, partial: false,
      score: analysis.score, fetchStatus: "success", pagesFetched: 1,
    },
    report: generateQualityReport(findings, "rendered", threshold, undefined, 1, root),
  };
}

/**
 * Rendered detection without persisting the audit record (the facade persists).
 * @param root - explicit workspace root (redaction, report path relativising)
 */
export async function runRenderedCore(
  rt: DetectorRuntime, root: string, localhostUrl: string, config: RenderedOptions
): Promise<Outcome> {
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  const started = Date.now();
  try {
    if (shouldSkipRendered()) {
      logRedacted("warn", "Rendered detection skipped: 2+ consecutive failures (circuit breaker)", root);
      return emptyOutcome("skipped", threshold, root);
    }
    assertLocalhost(localhostUrl);
    resetCircuitBreaker();
    const fetched = await fetchLocalhostPage(localhostUrl);
    if (!fetched.success) return emptyOutcome("failed", threshold, root);
    return await analyzePage(rt, fetched.html ?? "", threshold, root, started);
  } catch (error: any) {
    const message = friendlyError(error, root);
    logRedacted("error", `Rendered detection error: ${message}`, root);
    return emptyOutcome(message.includes("not reachable") ? "skipped" : "failed", threshold, root);
  }
}
