/**
 * TypeScript interfaces for Impeccable design detection integration.
 * 
 * Defines the data models for findings, reports, detection results,
 * and the service interfaces used across all components.
 * 
 * Security conditions from SECURITY-REVIEW.md C5-C6 are enforced
 * in the report sanitization and error wrapping logic.
 */

import { Dirent } from "fs";

/** A single design issue finding returned by the WASM detector */
export interface Finding {
  findingId: string;
  runId: string;
  mode: "static" | "rendered";
  file: string; // relative path within workspace
  severity: "low" | "medium" | "high";
  message: string;
  line?: number;
  column?: number;
}

/** The result of a static or rendered detection run */
export interface DetectionResult {
  findings: Finding[];
  fileCount: number;
  durationMs: number;
  cacheHit: boolean;
  partial: boolean; // true if detection timed out partially
}

/** Configuration for a detection run */
export interface DetectionConfig {
  detectionMode?: "static" | "rendered" | "both";
  threshold?: number; // 0-1 quality score threshold
  cacheReuse?: boolean;
  sourceRoot?: string; // workspace root for path validation
  localhostUrl?: string; // dev server URL for rendered detection
  urls?: string[]; // additional pages for rendered detection
}

/** Aggregated quality gate report */
export interface QualityReport {
  runId: string;
  detectionMode: "static" | "rendered" | "both";
  threshold: number;
  score: number; // 0-1
  pass: boolean;
  timestamp: string;
  findings: Finding[];
  totalIssues: number;
  severityBreakdown: {
    low: number;
    medium: number;
    high: number;
  };
  /** C6: sanitized error/fallback notice (never raw stack traces) */
  message?: string;
}

/** Detection run entity per FSD §4.2 (in-memory / JSON file store) */
export interface DetectionRun {
  runId: string;
  detectionMode: "static" | "rendered" | "both";
  threshold: number;
  score: number;
  pass: boolean;
  createdAt: string;
  userId: string;
  findings: Array<{
    findingId: string;
    runId: string;
    mode: "static" | "rendered";
    file: string;
    severity: "low" | "medium" | "high";
    message: string;
    line?: number;
  }>;
}

/** Instance identifier for a loaded detector */
export interface LoadInstance {
  instanceId: string;
  loadStatus: "success" | "error";
  message?: string;
}

/** Skill API loaded from the impeccable package */
export interface SkillAPI {
  loadWasm: (buffer: Buffer) => Promise<WasmDetectorRuntime>;
  isLoaded: () => boolean;
  getInstanceId: () => string;
}

/** WASM detector runtime interface */
export interface WasmDetectorRuntime {
  analyze: (content: string | Uint8Array, mode: "static" | "rendered") => Promise<FindingsResult>;
  getScore: () => number;
}

/** Findings result from WASM analysis */
export interface FindingsResult {
  findings: Finding[];
  score: number;
}

/** Cache entry for detection results */
export interface CacheEntry {
  runId: string;
  timestamp: number; // when cached
  result: DetectionResult;
}

/** Error types for the design gate */
export enum DetectionError {
  WASM_INCOMPATIBLE = "WASM_INCOMPATIBLE",
  PACKAGE_NOT_FOUND = "PACKAGE_NOT_FOUND",
  INVALID_PATH = "INVALID_PATH",
  TIMEOUT = "TIMEOUT",
  FETCH_FAILED = "FETCH_FAILED",
  DEV_SERVER_UNREACHABLE = "DEV_SERVER_UNREACHABLE",
  ERROR_LEAK = "ERROR_LEAK",
}

/** Custom error class for detection errors */
export class DetectionErrorException extends Error {
  constructor(
    public readonly code: DetectionError,
    message: string
  ) {
    super(message);
    this.name = "DetectionError";
  }
}

/** Helper functions to create detection errors */
export function createDetectionError(code: DetectionError, message: string): DetectionErrorException {
  return new DetectionErrorException(code, message);
}

/** Environment configuration keys (from DPG.md) */
export enum EnvConfig {
  IMPPECABLE_SKILL_PATH = "IMPPECABLE_SKILL_PATH",
  QUALITY_GATE_THRESHOLD = "QUALITY_GATE_THRESHOLD",
  DESIGN_DETECTION_MODE = "DESIGN_DETECTION_MODE",
  LOCALHOST_DEV_SERVER_URL = "LOCALHOST_DEV_SERVER_URL",
  WORKSPACE_ROOT = "WORKSPACE_ROOT",
}

/** Default quality gate threshold — configurable via QUALITY_GATE_THRESHOLD env (DPG.md) */
export const DEFAULT_THRESHOLD = parseFloat(
  process.env[EnvConfig.QUALITY_GATE_THRESHOLD] || "0.8"
);