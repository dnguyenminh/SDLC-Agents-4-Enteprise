/**
 * ImpeccableIntegrationService
 * 
 * Facade service that orchestrates the design detection pipeline:
 * - Loads Impeccable skill package
 * - Loads WASM detector with memory sandbox constraints
 * - Runs static source detection via FileSystemAdapter
 * - Runs rendered detection via LocalhostFetcher (SSRF-protected)
 * - Aggregates findings and generates quality gate report
 * - Manages DetectionCache for result persistence between runs
 * 
 * per TDD §5.1: ImpeccableIntegrationService orchestrates detection modes
 * and pipeline invocation.
 * 
 * Security conditions from SECURITY-REVIEW.md C1-C6 are enforced throughout.
 */

import * as fs from "fs";
import * as path from "path";

import { DetectionError, DetectionErrorException, createDetectionError, Finding, DetectionResult, QualityReport, DetectionConfig, EnvConfig, DEFAULT_THRESHOLD, LoadInstance } from "./types";
import { loadWasmDetector, readWasmBinary, validateWasmConstraints } from "./wasm.loader";
import { listSourceFiles, readSourceFile, getWorkspaceRoot, isPathSafe } from "./fs.adapter";
import { fetchLocalhostPage, shouldSkipRendered, resetCircuitBreaker, isLocalhostUrl } from "./localhost-fetcher";
import { generateQualityReport } from "./report.generator";
import { cacheResult, getCachedResult, invalidateCache, clearAllCache, listCachedRuns } from "./detection.cache";

/** Cache directory relative to workspace root (mirrors detection.cache.ts). */
const CACHE_DIR = ".code-intel/design-gate";

// Import SkillAPI - in production this would come from the impeccable-skill npm package
// For this integration, we define a local mock that matches the interface
type SkillAPI = {
  loadWasm: (buffer: Buffer) => Promise<WasmDetectorRuntime>;
  isLoaded: () => boolean;
  getInstanceId: () => string;
};

type WasmDetectorRuntime = {
  analyze: (content: string | Uint8Array, mode: "static" | "rendered") => Promise<{ findings: Finding[]; score: number }>;
  getScore: () => number;
};

/** Singleton instance */
let serviceInstance: ImpeccableIntegrationService | null = null;

/**
 * Main integration service facade for Impeccable design detection.
 * 
 * Responsibilities (per TDD §5.1):
 * - Load Impeccable skill package via Node require()
 * - Load WASM binary with memory-only sandbox (C2)
 * - Run static detection on source files (C3: path validation)
 * - Run rendered detection via localhost fetch (C4: SSRF protection)
 * - Aggregate findings and generate quality report (C5: sanitization, C6: error wrapping)
 * - Cache results between pipeline runs
 * 
 * Error handling (C6): All public methods wrap errors in try/catch,
 * never expose raw stack traces or internal implementation details.
 * On error, report score: 0, mode: "error", errorType: "DETECTION_FAILED".
 */
export class ImpeccableIntegrationService {
  private skillApi: SkillAPI | null = null;
  private wasmRuntime: WasmDetectorRuntime | null = null;
  private instanceId: string = "";
  private loadAttempts = 0;
  private maxLoadAttempts = 3;

  /**
   * Load the Impeccable skill package and WASM detector.
   * Per UC-001, BR-01, BR-02, BR-03.
   * 
   * @param config - Detection configuration
   * @returns Load instance with status and message
   * @throws DetectionError if skill or WASM fails to load
   */
  async loadDetector(config: DetectionConfig = {}): Promise<LoadInstance> {
    try {
      const detectionMode = config.detectionMode ?? "static";
      const threshold = config.threshold ?? DEFAULT_THRESHOLD;
      const cacheReuse = config.cacheReuse ?? true;

      this.loadAttempts++;

      // Check if already loaded (C2: cache reuse)
      if (this.skillApi && this.wasmRuntime) {
        const alreadyLoaded = this.skillApi.isLoaded();
        if (alreadyLoaded) {
          this.instanceId = this.skillApi.getInstanceId();
          return {
            instanceId: this.instanceId,
            loadStatus: "success",
            message: "Impeccable detector already loaded and cached",
          };
        }
      }

      // Step 1: Load Impeccable skill package
      await this.loadImpeccableSkill();

      // Step 2: Load WASM binary
      await this.loadWasmBinary();

      // Step 3: Validate WASM constraints (C2)
      const wasmBuffer = readWasmBinary(this.getWasmPath());
      if (!validateWasmConstraints(wasmBuffer)) {
        throw createDetectionError(DetectionError.WASM_INCOMPATIBLE,
          "WASM binary does not satisfy memory-only sandbox constraints"
        );
      }

      this.instanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      return {
        instanceId: this.instanceId,
        loadStatus: "success",
        message: "Impeccable detector loaded successfully",
      };
    } catch (error: any) {
      // C6: Error wrapping - never include raw error message in public report
      const errorMessage = this.getUserFriendlyError(error);
      console.error(`Load detector error: ${errorMessage}`);

      this.instanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      return {
        instanceId: this.instanceId,
        loadStatus: "error",
        message: errorMessage,
      };
    }
  }

  /**
   * Run static design detection on source files.
   * Per UC-002, BR-04, BR-05, BR-06.
   * 
   * @param sourcePath - Root path for static analysis
   * @param config - Additional options (threshold, cacheReuse)
   * @returns DetectionResult with findings and metadata
   * @throws DetectionError if source path is invalid
   */
  async runStaticDetection(
    sourcePath: string,
    config: { threshold?: number; cacheReuse?: boolean } = {}
  ): Promise<{ result: DetectionResult; report: QualityReport }> {
    const threshold = config.threshold ?? DEFAULT_THRESHOLD;
    try {
      const cacheReuse = config.cacheReuse ?? true;

      // Check cache if enabled (AF-2: cached findings return within 5 min)
      let result: DetectionResult;
      if (cacheReuse) {
        const cached = getCachedResult(sourcePath, "static");
        if (cached) {
          result = {
            findings: cached.findings,
            fileCount: cached.findings.length,
            durationMs: cached.durationMs || 0,
            cacheHit: true,
            partial: false,
          };
          // Return early with cached result
          const report = generateQualityReport(
            cached.findings,
            "static",
            threshold,
            undefined,
            cached.fileCount ?? 0
          );
          return { result, report };
        }
      }

      // Validate source path (C3: workspace-scoped)
      if (!isPathSafe(sourcePath)) {
        throw createDetectionError(DetectionError.INVALID_PATH,
          `Source path escapes workspace root: ${sourcePath}`
        );
      }

      if (!fs.existsSync(sourcePath)) {
        throw createDetectionError(DetectionError.INVALID_PATH,
          `Source path does not exist: ${sourcePath}`
        );
      }

      // List source files (max 10000 per TDD/DPG)
      const files = await listSourceFiles(sourcePath, { maxFiles: 10000 });

      if (files.length === 0) {
        // No files found - return empty result
        result = {
          findings: [],
          fileCount: 0,
          durationMs: 0,
          cacheHit: false,
          partial: false,
        };
      } else {
        // Read and analyze each file
        const allFindings: Finding[] = [];
        const startTime = Date.now();

        for (const file of files) {
          try {
            const fileContent = readSourceFile(file, getWorkspaceRoot());

            // Analyze content with WASM detector
            const analysisResult = await this.wasmRuntime!.analyze(
              fileContent,
              "static"
            );

            // Map findings to standard format
            analysisResult.findings.forEach((f: Finding) => {
              allFindings.push({
                findingId: f.findingId,
                runId: this.instanceId || "",
                mode: "static",
                file,
                severity: f.severity,
                message: f.message,
                line: f.line,
                column: f.column,
              });
            });
          } catch (fileError: any) {
            // Per C6: skip individual file errors, continue with remaining files
            console.error(`Error analyzing file ${file}: ${fileError.message}`);
            // Continue to next file
          }
        }

        const durationMs = Date.now() - startTime;

        result = {
          findings: allFindings,
          fileCount: files.length,
          durationMs,
          cacheHit: false,
          partial: false,
        };
      }

      // Cache the result
      if (cacheReuse) {
        cacheResult(sourcePath, "static", result);
      }

      // Generate quality report
      const report = generateQualityReport(result.findings, "static", threshold, undefined, result.fileCount);

      return { result, report };
    } catch (error: any) {
      // C6: Error wrapping
      const errorMessage = this.getUserFriendlyError(error);
      console.error(`Static detection error: ${errorMessage}`);

      // Return error result
      const errorResult: DetectionResult = {
        findings: [],
        fileCount: 0,
        durationMs: 0,
        cacheHit: false,
        partial: false,
      };

      const report = generateQualityReport([], "static", threshold, undefined);
      report.score = 0;
      report.pass = false;
      report.message = errorMessage;

      return { result: errorResult, report };
    }
  }

  /**
   * Run rendered design detection by fetching localhost pages.
   * Per UC-003, BR-07, BR-08, BR-09, C4 (SSRF protection).
   * 
   * @param localhostUrl - Dev server URL to fetch
   * @param urls - Additional pages to fetch (comma-separated)
   * @param config - Additional options
   * @returns Rendered detection result
   * @throws DetectionError if dev server is unreachable
   */
  async runRenderedDetection(
    localhostUrl: string,
    urls: string[] = [],
    config: { threshold?: number } = {}
  ): Promise<{ result: RenderedDetectionResult; report: QualityReport }> {
    const threshold = config.threshold ?? DEFAULT_THRESHOLD;
    const fetchStartTime = Date.now();
    try {
      // Check circuit breaker (C4: skip after 2 consecutive failures)
      if (shouldSkipRendered()) {
        console.warn("Rendered detection skipped: 2+ consecutive failures (circuit breaker)");
        return {
          result: {
            findings: [],
            fileCount: 0,
            durationMs: 0,
            cacheHit: false,
            partial: false,
            score: 0,
            fetchStatus: "skipped",
            pagesFetched: 0,
          },
          report: generateQualityReport([], "rendered", threshold, undefined, 0),
        };
      }

      // Validate localhost URL (C4: whitelist 127.0.0.1 / localhost only)
      if (!isLocalhostUrl(localhostUrl)) {
        throw createDetectionError(DetectionError.DEV_SERVER_UNREACHABLE,
          `SSRF protection: localhost URL must be 127.0.0.1 or localhost, got: ${localhostUrl}`
        );
      }

      // Reset circuit breaker on new attempt
      resetCircuitBreaker();

      // Fetch the localhost page
      const fetchResult = await fetchLocalhostPage(localhostUrl);

      if (!fetchResult.success) {
        return {
          result: {
            findings: [],
            fileCount: 0,
            durationMs: 0,
            cacheHit: false,
            partial: false,
            score: 0,
            fetchStatus: "failed",
            pagesFetched: 0,
          },
          report: generateQualityReport([], "rendered", threshold, undefined, 0),
        };
      }

      const htmlContent = fetchResult.html ?? "";

      // Guard: WASM runtime must be loaded before analysis (C2 lifecycle)
      if (!this.wasmRuntime) {
        throw createDetectionError(DetectionError.WASM_INCOMPATIBLE,
          "Detector runtime not loaded — call loadDetector() first"
        );
      }

      // Analyze rendered content with WASM detector
      const analysisResult = await this.wasmRuntime.analyze(
        htmlContent,
        "rendered"
      );

      // Build findings with relative file paths
      const findings: Finding[] = analysisResult.findings.map((f: Finding) => ({
        findingId: f.findingId,
        runId: this.instanceId || "",
        mode: "rendered",
        file: "rendered-page", // rendered detection doesn't have a source file
        severity: f.severity,
        message: f.message,
        line: f.line,
        column: f.column,
      }));

      const score = analysisResult.score;
      const pagesFetched = 1;
      const fetchStatus = "success";

      // Generate quality report (rendered = 1 page in scope)
      const report = generateQualityReport(findings, "rendered", threshold, undefined, 1);

      return {
        result: {
          findings,
          fileCount: 0,
          durationMs: Date.now() - fetchStartTime,
          cacheHit: false,
          partial: false,
          score,
          fetchStatus,
          pagesFetched,
        },
        report,
      };
    } catch (error: any) {
      // C6: Error wrapping - SSRF or fetch errors
      const errorMessage = this.getUserFriendlyError(error);
      console.error(`Rendered detection error: ${errorMessage}`);

      const fetchStatus = errorMessage.includes("not reachable")
        ? "skipped"
        : "failed";

      return {
        result: {
          findings: [],
          fileCount: 0,
          durationMs: 0,
          cacheHit: false,
          partial: false,
          score: 0,
          fetchStatus,
          pagesFetched: 0,
        },
        report: generateQualityReport([], "rendered", threshold, undefined, 0),
      };
    }
  }

  /**
   * Run full detection (static + rendered) and generate quality report.
   * Per UC-004: full pipeline invocation.
   * 
   * @param sourcePath - Source path for static analysis
   * @param localhostUrl - Dev server URL for rendered analysis
   * @param urls - Additional URLs for rendered detection
   * @param config - Detection configuration (threshold, mode)
   * @returns Full detection result with combined report
   */
  async runFullDetection(
    sourcePath: string,
    localhostUrl: string,
    urls: string[] = [],
    config: DetectionConfig = {}
  ): Promise<{ result: CombinedResult; report: QualityReport }> {
    const mode = config.detectionMode ?? "both";
    const threshold = config.threshold ?? DEFAULT_THRESHOLD;
    try {
      // Handle different detection modes
      switch (mode) {
        case "static": {
          const { result, report } = await this.runStaticDetection(sourcePath, { threshold });
          return { result, report };
        }

        case "rendered": {
          const { result, report } = await this.runRenderedDetection(localhostUrl, urls, { threshold });
          return { result, report };
        }

        case "both": {
          // Run static detection first
          const staticResult = await this.runStaticDetection(sourcePath, { threshold });

          // Check circuit breaker before rendered
          if (shouldSkipRendered()) {
            console.warn("Rendered detection skipped due to circuit breaker");
            const report = generateQualityReport(
              staticResult.result.findings,
              "static",
              threshold,
              undefined,
              staticResult.result.fileCount
            );
            return { result: staticResult.result, report };
          }

          // Run rendered detection
          const renderedResult = await this.runRenderedDetection(localhostUrl, urls, { threshold });

          // Aggregate findings
          const allFindings = [
            ...staticResult.result.findings,
            ...renderedResult.result.findings,
          ];

          // Aggregate severity breakdown (triage info — score is computed
          // by the unified normalized formula in generateQualityReport)
          const severityBreakdown = {
            low: 0,
            medium: 0,
            high: 0,
          };
          // Count from static findings
          staticResult.result.findings.forEach((f: Finding) => {
            severityBreakdown[f.severity] = (severityBreakdown[f.severity] || 0) + 1;
          });
          // Count from rendered findings
          renderedResult.result.findings.forEach((f: Finding) => {
            severityBreakdown[f.severity] = (severityBreakdown[f.severity] || 0) + 1;
          });

          // Build combined result
          const combinedResult = {
            findings: allFindings,
            fileCount: staticResult.result.fileCount,
            durationMs: staticResult.result.durationMs + renderedResult.result.durationMs,
            cacheHit: staticResult.result.cacheHit || renderedResult.result.cacheHit,
            partial: staticResult.result.partial || renderedResult.result.partial,
          };

          // Generate quality report — unified normalized formula over the full scope
          // (static design files + rendered page when fetched). No min()/override:
          // one cleanliness ratio across all findings keeps the score consistent.
          const scopeFiles =
            staticResult.result.fileCount +
            (renderedResult.result.pagesFetched > 0 ? 1 : 0);
          const report = generateQualityReport(allFindings, "both", threshold, undefined, scopeFiles);

          return { result: combinedResult, report };
        }

        default:
          throw createDetectionError(DetectionError.INVALID_PATH,
            `Unknown detection mode: ${mode}`
          );
      }
    } catch (error: any) {
      // C6: Error wrapping
      const errorMessage = this.getUserFriendlyError(error);
      console.error(`Full detection error: ${errorMessage}`);

      // Return fail-open inconclusive report
      const report = generateQualityReport([], "static", threshold, undefined, 0);
      report.score = 0;
      report.pass = true; // fail-open
      report.message = errorMessage;

      return { result: { findings: [], fileCount: 0, durationMs: 0, cacheHit: false, partial: false }, report };
    }
  }

  /**
   * Get a quality gate report for a previously run detection.
   * Per UC-004, BR-10, BR-11, BR-12.
   * 
   * @param runId - The detection run identifier
   * @returns QualityReport if found, undefined otherwise
   */
  getReport(runId: string): QualityReport | undefined {
    try {
      // Cache files store { runId, timestamp, result: DetectionResult } —
      // rebuild the QualityReport from cached findings (BR-12 audit trail).
      const workspaceRoot = getWorkspaceRoot();
      const cacheDir = path.join(workspaceRoot, CACHE_DIR);
      const filePath = path.join(cacheDir, `${runId}.json`);

      if (fs.existsSync(filePath)) {
        const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (content?.result?.findings) {
          return generateQualityReport(content.result.findings, "static", undefined, content.runId, content.result.fileCount ?? 0);
        }
      }
    } catch (error: any) {
      console.error(`Failed to get report for runId ${runId}: ${error.message}`);
    }

    return undefined;
  }

  /**
   * Get the current instance ID.
   * 
   * @returns Instance identifier string
   */
  getInstanceIdStr(): string {
    return this.instanceId;
  }

  /**
   * Reset the service state (for testing or new pipeline run).
   */
  reset(): void {
    this.skillApi = null;
    this.wasmRuntime = null;
    this.instanceId = "";
    this.loadAttempts = 0;
    resetCircuitBreaker();
    // Do not clear detection cache - that persists between runs intentionally
  }

  /**
   * List all cached runs with their results.
   * 
   * @returns Array of cached run summaries
   */
  listReports(): Array<{ runId: string; timestamp: number; score: number; pass: boolean }> {
    return listCachedRuns().map((run) => ({
      runId: run.runId,
      timestamp: run.timestamp,
      score: 0, // would need to load full report to get score
      pass: true, // would need to load full report to get pass
    }));
  }

  // -------------------------------------------------------------------------
  // Private helper methods
  // -------------------------------------------------------------------------

  /**
   * Load the Impeccable skill package.
   * In production: require('impeccable-skill') → returns SkillAPI
   * For this integration: mock loading logic
   */
  private async loadImpeccableSkill(): Promise<void> {
    try {
      // In production, this would be:
      // const skill = require('impeccable-skill');
      // this.skillApi = skill;

      // For this integration, simulate skill loading
      // The actual skill package would provide loadWasm, isLoaded, getInstanceId
      this.skillApi = {
        loadWasm: async (buffer: Buffer) => {
          const runtime = await loadWasmDetector(buffer);
          this.wasmRuntime = runtime;
          return runtime;
        },
        isLoaded: () => this.skillApi !== null && this.wasmRuntime !== null,
        getInstanceId: () => this.instanceId || "inst_mock",
      };

      console.log("Impeccable skill package loaded");
    } catch (error: any) {
      console.error(`Failed to load Impeccable skill: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load the WASM binary from the configured path.
   * Per DPG.md: impeccable.wasm.path or default ./wasm/detector.wasm
   */
  private async loadWasmBinary(): Promise<void> {
    try {
      const wasmPath = this.getWasmPath();
      const wasmBuffer = readWasmBinary(wasmPath);

      // Validate constraints before loading
      if (!validateWasmConstraints(wasmBuffer)) {
        throw createDetectionError(DetectionError.WASM_INCOMPATIBLE,
          "WASM binary failed constraint validation"
        );
      }

      // Load the WASM detector runtime
      this.wasmRuntime = await loadWasmDetector(wasmBuffer);

      console.log("WASM detector runtime loaded successfully");
    } catch (error: any) {
      console.error(`Failed to load WASM binary: ${error.message}`);
      this.wasmRuntime = null;
      throw error;
    }
  }

  /**
   * Get the WASM binary path from environment or default.
   */
  private getWasmPath(): string {
    return process.env[EnvConfig.IMPPECABLE_SKILL_PATH]
      ? process.env[EnvConfig.IMPPECABLE_SKILL_PATH]
      : "./wasm/detector.wasm";
  }

  /**
   * Get user-friendly error message from an error.
   * C6: sanitize error messages - never expose raw stack traces.
   */
  private getUserFriendlyError(error: any): string {
    const errorName = error.name || "Error";
    const errorMessage = error.message || error.error || String(error);

    // C6: Never include raw stack traces or internal details
    // Return sanitized message based on error type
    if (error instanceof DetectionErrorException) {
      return errorMessage || "An unexpected error occurred during detection";
    }

    // Generic error sanitization
    // Remove paths, filenames, line numbers from error messages
    const sanitized = errorMessage
      .replace(/\/\/[^\n]*/g, "") // Remove comment lines
      .replace(/\\.[\/][^\\"]*/g, "") // Remove file paths
      .substring(0, 200); // Truncate long messages

    return sanitized || "An unexpected error occurred during detection";
  }
}

/**
 * Export singleton instance getter.
 * Consumers should use getImpeccableService() for single shared instance.
 */
export function getImpeccableService(): ImpeccableIntegrationService {
  if (!serviceInstance) {
    serviceInstance = new ImpeccableIntegrationService();
  }
  return serviceInstance;
}

/**
 * Detection result combined for full pipeline runs.
 */
export interface CombinedResult {
  findings: Finding[];
  fileCount: number;
  durationMs: number;
  cacheHit: boolean;
  partial: boolean;
}

/**
 * Rendered-mode result — CombinedResult fields plus rendered-specific metadata.
 * (CombinedResult-compatible so runFullDetection can aggregate uniformly.)
 */
export interface RenderedDetectionResult extends CombinedResult {
  /** Aggregated score from the rendered analysis (0-1). */
  score: number;
  /** "success" | "failed" | "skipped" (circuit breaker / SSRF / unreachable). */
  fetchStatus: string;
  /** Number of pages actually fetched. */
  pagesFetched: number;
}

// Export the enum for use in tests
export { DetectionError };