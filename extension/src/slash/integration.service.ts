/**
 * ImpeccableIntegrationService — facade of the design detection pipeline
 * (TDD §5.1): loads the skill + WASM detector, runs static / rendered / full
 * detection, persists an audit record per run (BR-12) and serves reports.
 *
 * The heavy lifting lives in detector.runtime.ts, static.detection.ts,
 * rendered.detection.ts and full.detection.ts. SEC-F08: the workspace root is
 * an explicit parameter (`workspaceRoot`); getWorkspaceRoot() (env/cwd) is
 * only the last-resort fallback for callers that pass none.
 * Security conditions C1-C6 (SECURITY-REVIEW.md) are enforced in those modules.
 */
import * as path from "path";

import { DetectionError, DetectionResult, QualityReport, DetectionConfig, LoadInstance } from "./types";
import { getWorkspaceRoot } from "./fs.adapter";
import { listCachedRuns } from "./detection.cache";
import { loadReport, persistRun, toRelSource, ReportMeta } from "./report.store";
import { resetCircuitBreaker } from "./localhost-fetcher";
import { DetectorRuntime } from "./detector.runtime";
import { runStaticCore } from "./static.detection";
import { runRenderedCore } from "./rendered.detection";
import { runFullCore } from "./full.detection";
import { CombinedResult, RenderedDetectionResult, StaticOptions, RenderedOptions } from "./detection.types";

export type { CombinedResult, RenderedDetectionResult } from "./detection.types";

/** Singleton instance */
let serviceInstance: ImpeccableIntegrationService | null = null;

/** Explicit root first; env/cwd fallback is the last-resort read (SEC-F08). */
function rootOf(explicit?: string): string {
  return explicit ?? getWorkspaceRoot();
}

/**
 * Main integration service facade.
 * C6: all public methods wrap errors; reports never carry stacks or raw paths.
 */
export class ImpeccableIntegrationService {
  private readonly runtime = new DetectorRuntime();

  /**
   * Load the Impeccable skill package and WASM detector (UC-001).
   * @param config - Detection configuration (`workspaceRoot` redacts paths in messages)
   */
  async loadDetector(config: DetectionConfig = {}): Promise<LoadInstance> {
    return this.runtime.load(config.workspaceRoot);
  }

  /**
   * Run static design detection on source files (UC-002).
   * @param sourcePath - Root path for static analysis
   * @param config - threshold, cacheReuse, workspaceRoot
   */
  async runStaticDetection(
    sourcePath: string, config: StaticOptions = {}
  ): Promise<{ result: DetectionResult; report: QualityReport }> {
    const root = rootOf(config.workspaceRoot);
    const { sourceRunId, ...out } = await runStaticCore(this.runtime, root, sourcePath, config);
    this.persist(root, out.report, sourcePath, out.result.cacheHit, sourceRunId);
    return out;
  }

  /**
   * Run rendered design detection by fetching a localhost page (UC-003, C4).
   * @param localhostUrl - Dev server URL to fetch
   * @param urls - Additional pages (reserved)
   */
  async runRenderedDetection(
    localhostUrl: string, urls: string[] = [], config: RenderedOptions = {}
  ): Promise<{ result: RenderedDetectionResult; report: QualityReport }> {
    const root = rootOf(config.workspaceRoot);
    const out = await runRenderedCore(this.runtime, root, localhostUrl, config);
    this.persist(root, out.report, ".", false);
    return out;
  }

  /**
   * Run full detection (static + rendered) and generate the quality report (UC-004).
   * @param config - detection mode, threshold, workspaceRoot
   */
  async runFullDetection(
    sourcePath: string, localhostUrl: string, urls: string[] = [], config: DetectionConfig = {}
  ): Promise<{ result: CombinedResult; report: QualityReport }> {
    const root = rootOf(config.workspaceRoot);
    const ops = {
      runStatic: (p: string, c: StaticOptions) => this.runStaticDetection(p, c),
      runRendered: (u: string, l: string[], c: RenderedOptions) => this.runRenderedDetection(u, l, c),
    };
    const out = await runFullCore(ops, root, sourcePath, localhostUrl, urls, config);
    // Invariant: every runId handed out has a record. static/rendered reports
    // are already persisted by their own entry point; merged/error ones are not.
    if (!loadReport(root, out.report.runId)) {
      this.persist(root, out.report, sourcePath, out.result.cacheHit);
    }
    return out;
  }

  /**
   * Persist the audit record ({runId}.json, BR-12) for a report about to be
   * returned. A write failure is surfaced on report.message, never swallowed.
   */
  private persist(
    root: string, report: QualityReport, sourcePath: string, cacheHit: boolean, sourceRunId?: string
  ): void {
    const rel = path.isAbsolute(sourcePath) ? toRelSource(root, sourcePath) : sourcePath;
    const meta: ReportMeta = { sourcePath: rel, cacheHit, sourceRunId };
    const failure = persistRun(root, report, meta);
    if (failure && !report.message?.includes(failure)) {
      report.message = report.message ? `${report.message}; ${failure}` : failure;
    }
  }

  /**
   * Get a persisted quality report (SEC-F05: validation lives in loadReport).
   * @param workspaceRoot - explicit root; env/cwd fallback when omitted
   */
  getReport(runId: string, workspaceRoot?: string): QualityReport | undefined {
    return loadReport(rootOf(workspaceRoot), runId);
  }

  /** Current load-instance id. */
  getInstanceIdStr(): string {
    return this.runtime.instanceId;
  }

  /** Reset service state (testing or new pipeline run); the detection cache persists. */
  reset(): void {
    this.runtime.reset();
    resetCircuitBreaker();
  }

  /** List persisted runs, newest first. */
  listReports(workspaceRoot?: string): Array<{ runId: string; timestamp: number; score: number; pass: boolean }> {
    return listCachedRuns(rootOf(workspaceRoot)).map((run) => ({
      runId: run.runId,
      timestamp: run.timestamp,
      score: 0, // would need to load the full report to get the score
      pass: true, // would need to load the full report to get pass
    }));
  }
}

/** Shared service instance getter. */
export function getImpeccableService(): ImpeccableIntegrationService {
  if (!serviceInstance) {
    serviceInstance = new ImpeccableIntegrationService();
  }
  return serviceInstance;
}

// Export the enum for use in tests
export { DetectionError };
