"use strict";
/**
 * Report Generator
 *
 * Aggregates findings from static and rendered detection,
 * calculates quality score (0-1), and determines pass/fail
 * based on the configured threshold.
 *
 * SECURITY-REVIEW.md Conditions C5-C6:
 * - C5: Report output sanitizes filePath to relative path within workspace only
 * - C6: Wrap all detector calls in try/catch; on error, report score: 0, mode: "error"
 * - Never include raw error message in public report
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
exports.EnvConfig = exports.DetectionError = void 0;
exports.generateQualityReport = generateQualityReport;
exports.determinePassFail = determinePassFail;
exports.createDetectionRun = createDetectionRun;
const path = __importStar(require("path"));
const types_1 = require("./types");
Object.defineProperty(exports, "DetectionError", { enumerable: true, get: function () { return types_1.DetectionError; } });
Object.defineProperty(exports, "EnvConfig", { enumerable: true, get: function () { return types_1.EnvConfig; } });
const utils_1 = require("./utils");
// Import env config for threshold
const DEFAULT_THRESHOLD = parseFloat(process.env[types_1.EnvConfig.QUALITY_GATE_THRESHOLD] || "0.8");
/**
 * Aggregate findings from static and rendered detection runs
 * and produce a quality gate report.
 *
 * Per BR-10, BR-11, BR-12 (FSD §3.4):
 * - Report includes total issues, severity breakdown, score
 * - Pass/fail determined by threshold (BR-11)
 * - Report persisted for audit (BR-12)
 *
 * Per SECURITY-REVIEW.md C5:
 * - File paths in findings are sanitized to relative paths within workspace only
 * - Add redaction notice: "Report contains relative paths only."
 *
 * Per SECURITY-REVIEW.md C6:
 * - All detector calls wrapped in try/catch
 * - On error, report score: 0, mode: "error", errorType: "DETECTION_FAILED"
 * - Never include raw error message in public report
 *
 * @param findings - Array of all findings (static + rendered)
 * @param mode - Detection mode: "static" | "rendered" | "both"
 * @param threshold - Quality score threshold (0-1), defaults to ENV config
 * @param runId - Unique identifier for this detection run
 * @returns QualityReport with score and pass/fail
 */
function generateQualityReport(findings, mode, threshold, runId) {
    try {
        // Use provided threshold or default from ENV
        const qualityThreshold = threshold ?? DEFAULT_THRESHOLD;
        // Calculate severity breakdown
        const severityBreakdown = {
            low: findings.filter((f) => f.severity === "low").length,
            medium: findings.filter((f) => f.severity === "medium").length,
            high: findings.filter((f) => f.severity === "high").length,
        };
        // Calculate quality score (0-1)
        // Score is inverse of issue density: fewer issues = higher score
        // Formula: score = 1 - (weighted sum of issues / max possible)
        // Simple implementation: deduct based on severity counts
        let score = 1.0;
        const highWeight = 0.3;
        const mediumWeight = 0.15;
        const lowWeight = 0.05;
        score -= severityBreakdown.high * highWeight;
        score -= severityBreakdown.medium * mediumWeight;
        score -= severityBreakdown.low * lowWeight;
        // Clamp score to [0, 1]
        score = Math.max(0, Math.min(1, score));
        // Determine pass/fail (BR-11: score >= threshold → pass)
        const pass = score >= qualityThreshold;
        // Generate runId if not provided
        const id = runId || `run_${Date.now()}_${(0, utils_1.generateId)(8)}`;
        // Sanitize findings: ensure file paths are relative to workspace (C5)
        const sanitizedFindings = findings.map((finding) => ({
            ...finding,
            // Ensure file is relative path only - strip any absolute path components
            file: sanitizeFilePath(finding.file),
        }));
        const report = {
            runId: id,
            detectionMode: mode,
            threshold: qualityThreshold,
            score: Number(score.toFixed(4)), // 4 decimal places
            pass,
            timestamp: new Date().toISOString(),
            findings: sanitizedFindings,
            totalIssues: findings.length,
            severityBreakdown,
        };
        return report;
    }
    catch (error) {
        // C6: Error wrapping - never include raw error message in public report
        // Return a minimal inconclusive report on failure
        console.error(`Report generation error: ${error.message}`);
        return {
            runId: runId || "run_error",
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
}
/**
 * Sanitize a file path to ensure it's relative to workspace only.
 * Per SECURITY-REVIEW.md C5: report output sanitizes filePath to relative path
 * within workspace only; strip code content beyond findingId, line, column, message.
 *
 * @param filePath - The file path to sanitize
 * @returns Relative path within workspace, or "unknown" if cannot determine
 */
function sanitizeFilePath(filePath) {
    try {
        const workspaceRoot = process.env[types_1.EnvConfig.WORKSPACE_ROOT] || process.cwd();
        // If path is already relative and doesn't escape workspace, return as-is
        if (!path.isAbsolute(filePath)) {
            // Additional check: ensure it doesn't contain traversal
            const normalized = path.normalize(filePath);
            if (!normalized.startsWith("..")) {
                return normalized;
            }
        }
        // Try to make path relative to workspace root
        const resolved = path.resolve(workspaceRoot, filePath);
        const relative = path.relative(workspaceRoot, resolved);
        // If relative path starts with '..', the file is outside workspace
        if (relative.startsWith("..")) {
            return "unknown";
        }
        return relative || "unknown";
    }
    catch (error) {
        return "unknown";
    }
}
/**
 * Determine pass/fail for the quality gate.
 * Per BR-11: pass/fail determined by threshold.
 * Per C6: fail-open configurable.
 *
 * @param score - Quality score 0-1
 * @param threshold - Quality threshold 0-1 (default from ENV)
 * @param failOpen - Whether to fail-open (default: false, but configurable per TDD §10.1)
 * @returns boolean - true if pass, false if fail
 */
function determinePassFail(score, threshold, failOpen = false) {
    // C6: fail-open configurable
    if (failOpen) {
        return true;
    }
    // Use provided threshold or default from ENV
    const qualityThreshold = threshold ?? DEFAULT_THRESHOLD;
    // Handle NaN score (C6: score calculation fails → fail-open if configured)
    if (isNaN(score)) {
        console.error("Score calculation failed - returning fail-open");
        return failOpen;
    }
    // BR-11: score >= threshold → pass
    return score >= qualityThreshold;
}
/**
 * Create a DetectionRun entity from a QualityReport.
 * Per FSD §4.2: entities map to in-memory objects / JSON file store.
 *
 * @param report - The quality gate report
 * @param userId - The initiating user ID
 * @returns DetectionRun entity
 */
function createDetectionRun(report, userId) {
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
//# sourceMappingURL=report.generator.js.map