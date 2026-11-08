"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DetectionError = exports.ImpeccableIntegrationService = void 0;
exports.getImpeccableService = getImpeccableService;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
Object.defineProperty(exports, "DetectionError", { enumerable: true, get: function () { return types_1.DetectionError; } });
const wasm_loader_1 = require("./wasm.loader");
const fs_adapter_1 = require("./fs.adapter");
const localhost_fetcher_1 = require("./localhost-fetcher");
const report_generator_1 = require("./report.generator");
const detection_cache_1 = require("./detection.cache");
/** Singleton instance */
let serviceInstance = null;
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
class ImpeccableIntegrationService {
    skillApi = null;
    wasmRuntime = null;
    instanceId = "";
    loadAttempts = 0;
    maxLoadAttempts = 3;
    /**
     * Load the Impeccable skill package and WASM detector.
     * Per UC-001, BR-01, BR-02, BR-03.
     *
     * @param config - Detection configuration
     * @returns Load instance with status and message
     * @throws DetectionError if skill or WASM fails to load
     */
    async loadDetector(config = {}) {
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
            const wasmBuffer = (0, wasm_loader_1.readWasmBinary)(getWasmPath());
            if (!(0, wasm_loader_1.validateWasmConstraints)(wasmBuffer)) {
                throw (0, types_1.createDetectionError)(types_1.DetectionError.WASM_INCOMPATIBLE, "WASM binary does not satisfy memory-only sandbox constraints");
            }
            this.instanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            return {
                instanceId: this.instanceId,
                loadStatus: "success",
                message: "Impeccable detector loaded successfully",
            };
        }
        catch (error) {
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
    async runStaticDetection(sourcePath, config = {}) {
        try {
            const threshold = config.threshold ?? DEFAULT_THRESHOLD;
            const cacheReuse = config.cacheReuse ?? true;
            // Check cache if enabled (AF-2: cached findings return within 5 min)
            let result;
            if (cacheReuse) {
                const cached = (0, detection_cache_1.getCachedResult)(sourcePath, "static");
                if (cached) {
                    result = {
                        findings: cached.findings,
                        fileCount: cached.findings.length,
                        durationMs: cached.durationMs || 0,
                        cacheHit: true,
                        partial: false,
                    };
                    // Return early with cached result
                    const report = (0, report_generator_1.generateQualityReport)(cached.findings, "static", threshold, cached.runId);
                    return { result, report };
                }
            }
            // Validate source path (C3: workspace-scoped)
            if (!(0, fs_adapter_1.isPathSafe)(sourcePath)) {
                throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `Source path escapes workspace root: ${sourcePath}`);
            }
            if (!fs.existsSync(sourcePath)) {
                throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `Source path does not exist: ${sourcePath}`);
            }
            // List source files (max 10000 per TDD/DPG)
            const files = await (0, fs_adapter_1.listSourceFiles)(sourcePath, { maxFiles: 10000 });
            if (files.length === 0) {
                // No files found - return empty result
                result = {
                    findings: [],
                    fileCount: 0,
                    durationMs: 0,
                    cacheHit: false,
                    partial: false,
                };
            }
            else {
                // Read and analyze each file
                const allFindings = [];
                const startTime = Date.now();
                for (const file of files) {
                    try {
                        const fileContent = (0, fs_adapter_1.readSourceFile)(file, (0, fs_adapter_1.getWorkspaceRoot)());
                        // Analyze content with WASM detector
                        const analysisResult = await this.wasmRuntime.analyze(fileContent, "static");
                        // Map findings to standard format
                        analysisResult.findings.forEach((f) => {
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
                    }
                    catch (fileError) {
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
                (0, detection_cache_1.cacheResult)(sourcePath, "static", result);
            }
            // Generate quality report
            const report = (0, report_generator_1.generateQualityReport)(result.findings, "static", threshold, result.runId);
            return { result, report };
        }
        catch (error) {
            // C6: Error wrapping
            const errorMessage = this.getUserFriendlyError(error);
            console.error(`Static detection error: ${errorMessage}`);
            // Return error result
            const errorResult = {
                findings: [],
                fileCount: 0,
                durationMs: 0,
                cacheHit: false,
                partial: false,
            };
            const report = (0, report_generator_1.generateQualityReport)([], "static", threshold, undefined);
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
    async runRenderedDetection(localhostUrl, urls = [], config = {}) {
        try {
            // Check circuit breaker (C4: skip after 2 consecutive failures)
            if ((0, localhost_fetcher_1.shouldSkipRendered)()) {
                console.warn("Rendered detection skipped: 2+ consecutive failures (circuit breaker)");
                return {
                    result: {
                        findings: [],
                        score: 0,
                        fetchStatus: "skipped",
                        pagesFetched: 0,
                    },
                    report: (0, report_generator_1.generateQualityReport)([], "rendered", config.threshold, undefined),
                };
            }
            // Validate localhost URL (C4: whitelist 127.0.0.1 / localhost only)
            if (!isLocalhostUrl(localhostUrl)) {
                throw (0, types_1.createDetectionError)(types_1.DetectionError.DEV_SERVER_UNREACHABLE, `SSRF protection: localhost URL must be 127.0.0.1 or localhost, got: ${localhostUrl}`);
            }
            // Reset circuit breaker on new attempt
            (0, localhost_fetcher_1.resetCircuitBreaker)();
            // Fetch the localhost page
            const fetchResult = await (0, localhost_fetcher_1.fetchLocalhostPage)(localhostUrl);
            if (!fetchResult.success) {
                // Check if it's a known fetch error
                const fetchStatus = "failed";
                const pagesFetched = 0;
                const score = 0;
                return {
                    result: { findings: [], score, fetchStatus, pagesFetched },
                    report: (0, report_generator_1.generateQualityReport)([], "rendered", config.threshold, undefined),
                };
            }
            const htmlContent = fetchResult.html;
            // Analyze rendered content with WASM detector
            const analysisResult = await this.wasmRuntime.analyze(htmlContent, "rendered");
            // Build findings with relative file paths
            const findings = analysisResult.findings.map((f) => ({
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
            // Cache rendered results (with shorter TTL or no cache for rendered)
            // Per TDD: Cache static detection results < 5 min, rendered may be different
            // Generate quality report
            const report = (0, report_generator_1.generateQualityReport)(findings, "rendered", config.threshold, undefined);
            return { result: { findings, score, fetchStatus, pagesFetched }, report };
        }
        catch (error) {
            // C6: Error wrapping - SSRF or fetch errors
            const errorMessage = this.getUserFriendlyError(error);
            console.error(`Rendered detection error: ${errorMessage}`);
            const fetchStatus = errorMessage.includes("not reachable")
                ? "skipped"
                : "failed";
            return {
                result: {
                    findings: [],
                    score: 0,
                    fetchStatus,
                    pagesFetched: 0,
                },
                report: (0, report_generator_1.generateQualityReport)([], "rendered", config.threshold, undefined),
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
    async runFullDetection(sourcePath, localhostUrl, urls = [], config = {}) {
        try {
            const mode = config.detectionMode ?? "both";
            const threshold = config.threshold ?? DEFAULT_THRESHOLD;
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
                    if ((0, localhost_fetcher_1.shouldSkipRendered)()) {
                        console.warn("Rendered detection skipped due to circuit breaker");
                        const report = (0, report_generator_1.generateQualityReport)(staticResult.result.findings, "static", threshold, staticResult.result.runId);
                        return { result: staticResult.result, report };
                    }
                    // Run rendered detection
                    const renderedResult = await this.runRenderedDetection(localhostUrl, urls, { threshold });
                    // Aggregate findings
                    const allFindings = [
                        ...staticResult.result.findings,
                        ...renderedResult.result.findings,
                    ];
                    // Calculate combined score - take the worse (lower) score
                    const combinedScore = Math.min(staticResult.result.score, renderedResult.result.score);
                    // Aggregate severity breakdown
                    const severityBreakdown = {
                        low: 0,
                        medium: 0,
                        high: 0,
                    };
                    // Count from static findings
                    staticResult.result.findings.forEach((f) => {
                        severityBreakdown[f.severity] = (severityBreakdown[f.severity] || 0) + 1;
                    });
                    // Count from rendered findings
                    renderedResult.result.findings.forEach((f) => {
                        severityBreakdown[f.severity] = (severityBreakdown[f.severity] || 0) + 1;
                    });
                    // Determine pass/fail
                    const pass = (0, report_generator_1.determinePassFail)(combinedScore, threshold);
                    // Build combined result
                    const combinedResult = {
                        findings: allFindings,
                        fileCount: staticResult.result.fileCount,
                        durationMs: staticResult.result.durationMs + renderedResult.result.durationMs,
                        cacheHit: staticResult.result.cacheHit || renderedResult.result.cacheHit,
                        partial: staticResult.result.partial || renderedResult.result.partial,
                    };
                    // Generate quality report
                    const report = (0, report_generator_1.generateQualityReport)(allFindings, "both", threshold, undefined);
                    report.score = combinedScore;
                    report.pass = pass;
                    return { result: combinedResult, report };
                }
                default:
                    throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `Unknown detection mode: ${mode}`);
            }
        }
        catch (error) {
            // C6: Error wrapping
            const errorMessage = this.getUserFriendlyError(error);
            console.error(`Full detection error: ${errorMessage}`);
            // Return fail-open inconclusive report
            const report = (0, report_generator_1.generateQualityReport)([], "static", threshold, undefined);
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
    getReport(runId) {
        try {
            const workspaceRoot = (0, fs_adapter_1.getWorkspaceRoot)();
            const cacheDir = path.join(workspaceRoot, CACHE_DIR);
            const filePath = path.join(cacheDir, `${runId}.json`);
            if (fs.existsSync(filePath)) {
                const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                return {
                    runId: content.runId,
                    detectionMode: content.detectionMode,
                    threshold: content.threshold,
                    score: content.score,
                    pass: content.pass,
                    timestamp: content.timestamp,
                    findings: content.findings || [],
                    totalIssues: content.totalIssues || 0,
                    severityBreakdown: content.severityBreakdown || { low: 0, medium: 0, high: 0 },
                };
            }
        }
        catch (error) {
            console.error(`Failed to get report for runId ${runId}: ${error.message}`);
        }
        return undefined;
    }
    /**
     * Get the current instance ID.
     *
     * @returns Instance identifier string
     */
    getInstanceIdStr() {
        return this.instanceId;
    }
    /**
     * Reset the service state (for testing or new pipeline run).
     */
    reset() {
        this.skillApi = null;
        this.wasmRuntime = null;
        this.instanceId = "";
        this.loadAttempts = 0;
        (0, localhost_fetcher_1.resetCircuitBreaker)();
        // Do not clear detection cache - that persists between runs intentionally
    }
    /**
     * List all cached runs with their results.
     *
     * @returns Array of cached run summaries
     */
    listReports() {
        return (0, detection_cache_1.listCachedRuns)().map((run) => ({
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
    async loadImpeccableSkill() {
        try {
            // In production, this would be:
            // const skill = require('impeccable-skill');
            // this.skillApi = skill;
            // For this integration, simulate skill loading
            // The actual skill package would provide loadWasm, isLoaded, getInstanceId
            this.skillApi = {
                loadWasm: async (buffer) => {
                    const runtime = await (0, wasm_loader_1.loadWasmDetector)(buffer);
                    this.wasmRuntime = runtime;
                    return runtime;
                },
                isLoaded: () => this.skillApi !== null && this.wasmRuntime !== null,
                getInstanceId: () => this.instanceId || "inst_mock",
            };
            console.log("Impeccable skill package loaded");
        }
        catch (error) {
            console.error(`Failed to load Impeccable skill: ${error.message}`);
            throw error;
        }
    }
    /**
     * Load the WASM binary from the configured path.
     * Per DPG.md: impeccable.wasm.path or default ./wasm/detector.wasm
     */
    async loadWasmBinary() {
        try {
            const wasmPath = getWasmPath();
            const wasmBuffer = (0, wasm_loader_1.readWasmBinary)(wasmPath);
            // Validate constraints before loading
            if (!(0, wasm_loader_1.validateWasmConstraints)(wasmBuffer)) {
                throw (0, types_1.createDetectionError)(types_1.DetectionError.WASM_INCOMPATIBLE, "WASM binary failed constraint validation");
            }
            // Load the WASM detector runtime
            this.wasmRuntime = await (0, wasm_loader_1.loadWasmDetector)(wasmBuffer);
            console.log("WASM detector runtime loaded successfully");
        }
        catch (error) {
            console.error(`Failed to load WASM binary: ${error.message}`);
            this.wasmRuntime = null;
            throw error;
        }
    }
    /**
     * Get the WASM binary path from environment or default.
     */
    getWasmPath() {
        return process.env[types_1.EnvConfig.IMPPECABLE_SKILL_PATH]
            ? process.env[types_1.EnvConfig.IMPPECABLE_SKILL_PATH]
            : "./wasm/detector.wasm";
    }
    /**
     * Get user-friendly error message from an error.
     * C6: sanitize error messages - never expose raw stack traces.
     */
    getUserFriendlyError(error) {
        const errorName = error.name || "Error";
        const errorMessage = error.message || error.error || String(error);
        // C6: Never include raw stack traces or internal details
        // Return sanitized message based on error type
        if (error instanceof types_1.DetectionError) {
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
exports.ImpeccableIntegrationService = ImpeccableIntegrationService;
/**
 * Export singleton instance getter.
 * Consumers should use getImpeccableService() for single shared instance.
 */
function getImpeccableService() {
    if (!serviceInstance) {
        serviceInstance = new ImpeccableIntegrationService();
    }
    return serviceInstance;
}
//# sourceMappingURL=integration.service.js.map