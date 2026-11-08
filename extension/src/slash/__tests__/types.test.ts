import { describe, it, expect } from "vitest";
import {
  Finding,
  DetectionResult,
  QualityReport,
  DetectionConfig,
  LoadInstance,
  SkillAPI,
  WasmDetectorRuntime,
  FindingsResult,
  CacheEntry,
  DetectionError,
  EnvConfig,
} from "../types";

// Test the DetectionError enum values
describe("DetectionError enum", () => {
  it("should have all expected error types", () => {
    expect(DetectionError.WASM_INCOMPATIBLE).toBe("WASM_INCOMPATIBLE");
    expect(DetectionError.PACKAGE_NOT_FOUND).toBe("PACKAGE_NOT_FOUND");
    expect(DetectionError.INVALID_PATH).toBe("INVALID_PATH");
    expect(DetectionError.TIMEOUT).toBe("TIMEOUT");
    expect(DetectionError.FETCH_FAILED).toBe("FETCH_FAILED");
    expect(DetectionError.DEV_SERVER_UNREACHABLE).toBe("DEV_SERVER_UNREACHABLE");
    expect(DetectionError.ERROR_LEAK).toBe("ERROR_LEAK");
  });
});

// Test the EnvConfig enum values
describe("EnvConfig enum", () => {
  it("should have all expected environment config keys", () => {
    expect(EnvConfig.IMPPECABLE_SKILL_PATH).toBe("IMPPECABLE_SKILL_PATH");
    expect(EnvConfig.QUALITY_GATE_THRESHOLD).toBe("QUALITY_GATE_THRESHOLD");
    expect(EnvConfig.DESIGN_DETECTION_MODE).toBe("DESIGN_DETECTION_MODE");
    expect(EnvConfig.LOCALHOST_DEV_SERVER_URL).toBe("LOCALHOST_DEV_SERVER_URL");
    expect(EnvConfig.WORKSPACE_ROOT).toBe("WORKSPACE_ROOT");
  });
});

// Test Finding interface - default values
describe("Finding interface", () => {
  it("should create a valid Finding instance", () => {
    const finding: Finding = {
      findingId: "test_123",
      runId: "run_123",
      mode: "static",
      file: "src/index.ts",
      severity: "medium",
      message: "Test finding",
    };
    expect(finding.findingId).toBe("test_123");
    expect(finding.runId).toBe("run_123");
    expect(finding.mode).toBe("static");
    expect(finding.file).toBe("src/index.ts");
    expect(finding.severity).toBe("medium");
    expect(finding.message).toBe("Test finding");
    // Optional fields should be undefined
    expect(finding.line).toBeUndefined();
    expect(finding.column).toBeUndefined();
  });
});

// Test DetectionResult interface
describe("DetectionResult interface", () => {
  it("should create a valid DetectionResult instance", () => {
    const result: DetectionResult = {
      findings: [],
      fileCount: 0,
      durationMs: 0,
      cacheHit: false,
      partial: false,
    };
    expect(result.findings).toEqual([]);
    expect(result.fileCount).toBe(0);
    expect(result.durationMs).toBe(0);
    expect(result.cacheHit).toBe(false);
    expect(result.partial).toBe(false);
  });
});

// Test QualityReport interface
describe("QualityReport interface", () => {
  it("should create a valid QualityReport instance", () => {
    const report: QualityReport = {
      runId: "run_abc",
      detectionMode: "static",
      threshold: 0.8,
      score: 0.72,
      pass: false,
      timestamp: "2026-10-31T03:00:00Z",
      findings: [],
      totalIssues: 0,
      severityBreakdown: { low: 0, medium: 0, high: 0 },
    };
    expect(report.runId).toBe("run_abc");
    expect(report.detectionMode).toBe("static");
    expect(report.score).toBe(0.72);
    expect(report.pass).toBe(false);
    expect(report.totalIssues).toBe(0);
    expect(report.severityBreakdown.low).toBe(0);
    expect(report.severityBreakdown.medium).toBe(0);
    expect(report.severityBreakdown.high).toBe(0);
  });
});

// Test DetectionConfig interface
describe("DetectionConfig interface", () => {
  it("should create a valid DetectionConfig instance", () => {
    const config: DetectionConfig = {
      detectionMode: "both",
      threshold: 0.85,
      cacheReuse: true,
      sourceRoot: "/workspace/src",
    };
    expect(config.detectionMode).toBe("both");
    expect(config.threshold).toBe(0.85);
    expect(config.cacheReuse).toBe(true);
    expect(config.sourceRoot).toBe("/workspace/src");
  });
});

// Test LoadInstance interface
describe("LoadInstance interface", () => {
  it("should create a valid LoadInstance instance", () => {
    const instance: LoadInstance = {
      instanceId: "inst_123",
      loadStatus: "success",
      message: "Loaded successfully",
    };
    expect(instance.instanceId).toBe("inst_123");
    expect(instance.loadStatus).toBe("success");
    expect(instance.message).toBe("Loaded successfully");
  });
});

// Test SkillAPI interface
describe("SkillAPI interface", () => {
  it("should define the SkillAPI interface structure", () => {
    const skillApi: SkillAPI = {
      loadWasm: async (buffer: Buffer) => {
        return { findings: [], score: 0.5 };
      },
      isLoaded: () => true,
      getInstanceId: () => "inst_123",
    };
    expect(typeof skillApi.loadWasm).toBe("function");
    expect(typeof skillApi.isLoaded).toBe("function");
    expect(typeof skillApi.getInstanceId).toBe("function");
  });
});

// Test WasmDetectorRuntime interface
describe("WasmDetectorRuntime interface", () => {
  it("should define the WasmDetectorRuntime interface structure", () => {
    const runtime: WasmDetectorRuntime = {
      analyze: async (content: string | Uint8Array, mode: "static" | "rendered") => {
        return { findings: [], score: 0.5 };
      },
      getScore: () => 0.5,
    };
    expect(typeof runtime.analyze).toBe("function");
    expect(typeof runtime.getScore).toBe("function");
  });
});

// Test FindingsResult interface
describe("FindingsResult interface", () => {
  it("should create a valid FindingsResult instance", () => {
    const result: FindingsResult = {
      findings: [],
      score: 0.75,
    };
    expect(result.findings).toEqual([]);
    expect(result.score).toBe(0.75);
  });
});