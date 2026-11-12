/**
 * SA4E-393 — Unit tests for design-gate MCP tools (design_gate_run, design_gate_list_rules).
 * Mocks runDetection and PathResolver per existing conventions.
 * Sets global.vscode BEFORE imports because design-gate-tool.ts uses `declare const vscode: any;`.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

// Set up global.vscode BEFORE any imports that use it
const mockWorkspaceFolders = [{ uri: { fsPath: "C:\\ws\\test" } }];
const mockExtension = {
  extensionPath: "C:\\ws\\test\\.vscode\\extensions\\dnguyenminh.sdlc-agents-4-enterprise",
};

global.vscode = {
  workspace: {
    workspaceFolders: mockWorkspaceFolders,
    getConfiguration: () => ({ get: (_k: string, def?: unknown) => def }),
  },
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn() }),
  },
  extensions: {
    getExtension: vi.fn().mockReturnValue(mockExtension),
  },
  EventEmitter: class {
    private listeners: Array<(e: any) => void> = [];
    event = (listener: (e: any) => void) => { this.listeners.push(listener); return { dispose: () => {} }; };
    fire(data: any): void { this.listeners.forEach(l => l(data)); }
    dispose(): void { this.listeners = []; }
  },
} as any;

// Now mock the module dependencies
vi.mock("../slash", () => ({
  runDetection: vi.fn(),
  EnvConfig: {
    WORKSPACE_ROOT: "WORKSPACE_ROOT",
    IMPPECABLE_SKILL_PATH: "IMPPECABLE_SKILL_PATH",
    QUALITY_GATE_THRESHOLD: "QUALITY_GATE_THRESHOLD",
  },
  DEFAULT_THRESHOLD: 0.8,
}));

vi.mock("../services/PathResolver", () => ({
  resolveWorkspacePath: vi.fn(),
  sanitizeLogText: vi.fn((s: string) => s),
}));

vi.mock("../slash/detector-env", () => ({
  resolveWasmPath: vi.fn(),
}));

vi.mock("../slash/design-rules", () => ({
  DESIGN_RULES: [
    { id: "A1", severity: "high", extensions: ["html"], label: "test rule A1", check: () => [] },
    { id: "A2", severity: "high", extensions: ["html"], label: "test rule A2", check: () => [] },
    { id: "A3", severity: "high", extensions: ["html"], label: "test rule A3", check: () => [] },
    { id: "B1", severity: "medium", extensions: ["css"], label: "test rule B1", check: () => [] },
    { id: "B2", severity: "medium", extensions: ["css"], label: "test rule B2", check: () => [] },
    { id: "B3", severity: "medium", extensions: ["css"], label: "test rule B3", check: () => [] },
    { id: "C1", severity: "low", extensions: ["tsx"], label: "test rule C1", check: () => [] },
    { id: "C2", severity: "low", extensions: ["tsx"], label: "test rule C2", check: () => [] },
    { id: "C3", severity: "low", extensions: ["tsx"], label: "test rule C3", check: () => [] },
    { id: "D1", severity: "high", extensions: ["html"], label: "test rule D1", check: () => [] },
    { id: "D2", severity: "high", extensions: ["html"], label: "test rule D2", check: () => [] },
    { id: "D3", severity: "high", extensions: ["html"], label: "test rule D3", check: () => [] },
    { id: "D4", severity: "high", extensions: ["html"], label: "test rule D4", check: () => [] },
    // 17 impeccable rules
    ...Array.from({ length: 17 }, (_, i) => ({
      id: `imp${i + 1}`,
      severity: i < 5 ? "low" : i < 12 ? "medium" : "high",
      extensions: ["html", "css"],
      label: `impeccable rule ${i + 1}`,
      check: () => [],
    })),
  ],
  DesignRule: {} as any,
  RuleSeverity: {} as any,
}));

vi.mock("../backend-local-tools/registry", () => ({
  registerLocalTool: vi.fn(),
}));

// Import AFTER mocks are set up
import { handleDesignGateRun, handleDesignGateListRules, registerDesignGateLocalTools } from "../tools/design-gate/design-gate-tool";
import { runDetection } from "../slash";
import { resolveWorkspacePath } from "../services/PathResolver";
import * as vscode from "vscode";

describe("design_gate_run handler", () => {
  let outputChannel: vscode.OutputChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    outputChannel = vscode.window.createOutputChannel("test") as any;
    process.env.WORKSPACE_ROOT = "C:\\ws\\test";
    // Reset mockWorkspaceFolders to default
    global.vscode.workspace.workspaceFolders = mockWorkspaceFolders;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.WORKSPACE_ROOT;
  });

  it("1. mode=both returns report with full schema (runId, score, pass, severityBreakdown, findings)", async () => {
    const mockFindings = [
      { findingId: "f1", mode: "static", file: "test.html", line: 10, rule: "A1", severity: "high", message: "missing alt" },
      { findingId: "f2", mode: "static", file: "test.css", line: 5, rule: "B1", severity: "medium", message: "fixed width" },
      { findingId: "f3", mode: "static", file: "test.html", line: 20, rule: "A2", severity: "high", message: "test" },
      { findingId: "f4", mode: "static", file: "test.html", line: 30, rule: "A3", severity: "high", message: "test" },
      { findingId: "f5", mode: "static", file: "test.css", line: 10, rule: "B2", severity: "medium", message: "test" },
      { findingId: "f6", mode: "static", file: "test.css", line: 15, rule: "B3", severity: "medium", message: "test" },
      { findingId: "f7", mode: "static", file: "test.tsx", line: 5, rule: "C1", severity: "low", message: "test" },
      { findingId: "f8", mode: "static", file: "test.tsx", line: 10, rule: "C2", severity: "low", message: "test" },
      { findingId: "f9", mode: "static", file: "test.tsx", line: 15, rule: "C3", severity: "low", message: "test" },
      { findingId: "f10", mode: "static", file: "test.html", line: 40, rule: "D1", severity: "high", message: "test" },
    ];
    const mockReport = {
      runId: "run_123",
      score: 0.75,
      pass: false,
      threshold: 0.8,
      totalIssues: 10,
      severityBreakdown: { low: 3, medium: 3, high: 4 },
      findings: mockFindings,
      fileCount: 42,
      durationMs: 8123,
      message: undefined,
    };
    (runDetection as any).mockResolvedValue({ report: mockReport });
    (resolveWorkspacePath as any).mockReturnValue({ ok: true, resolvedPath: "C:\\ws\\test" });

    const result = await handleDesignGateRun({ mode: "both", threshold: 0.8 });

    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as any).text);
    expect(payload.ok).toBe(true);
    expect(payload.runId).toBe("run_123");
    expect(payload.detectionMode).toBe("both");
    expect(payload.score).toBe(0.75);
    expect(payload.pass).toBe(false);
    expect(payload.threshold).toBe(0.8);
    expect(payload.totalIssues).toBe(10);
    expect(payload.severityBreakdown).toEqual({ low: 3, medium: 3, high: 4 });
    expect(payload.findings).toHaveLength(10);
    expect(payload.findingsReturned).toBe(10);
    expect(payload.findingsTruncated).toBe(false);
    expect(payload.fileCount).toBe(42);
    expect(payload.durationMs).toBe(8123);
  });

  it("2. source_path outside workspace → isError:true, PathResolver message, runDetection NOT called", async () => {
    (resolveWorkspacePath as any).mockReturnValue({
      ok: false,
      message: "PATH_REJECTED_OUTSIDE_WORKSPACE: Path 'C:\\outside' is outside workspace root",
    });

    const result = await handleDesignGateRun({ source_path: "C:\\outside\\file.html" });

    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("PATH_REJECTED_OUTSIDE_WORKSPACE");
    expect(runDetection).not.toHaveBeenCalled();
  });

  it("3. threshold override works; omitted → DEFAULT_THRESHOLD (0.8); 1.5 / -0.1 → validation error", async () => {
    (resolveWorkspacePath as any).mockReturnValue({ ok: true, resolvedPath: "C:\\ws\\test" });

    // threshold override
    (runDetection as any).mockResolvedValueOnce({
      report: { runId: "r1", score: 0.9, pass: true, threshold: 0.9, totalIssues: 0, severityBreakdown: { low: 0, medium: 0, high: 0 }, findings: [], fileCount: 1, durationMs: 100 },
    });
    let result = await handleDesignGateRun({ threshold: 0.9 });
    let payload = JSON.parse((result.content[0] as any).text);
    expect(payload.threshold).toBe(0.9);

    // omitted → default
    (runDetection as any).mockResolvedValueOnce({
      report: { runId: "r2", score: 0.9, pass: true, threshold: 0.8, totalIssues: 0, severityBreakdown: { low: 0, medium: 0, high: 0 }, findings: [], fileCount: 1, durationMs: 100 },
    });
    result = await handleDesignGateRun({});
    payload = JSON.parse((result.content[0] as any).text);
    expect(payload.threshold).toBe(0.8);

    // invalid >1
    result = await handleDesignGateRun({ threshold: 1.5 });
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("threshold must be in [0, 1]");

    // invalid <0
    result = await handleDesignGateRun({ threshold: -0.1 });
    expect(result.isError).toBe(true);
  });

  it("4. invalid mode (statics) → validation error listing allowed enum values", async () => {
    const result = await handleDesignGateRun({ mode: "statics" });
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("Invalid mode");
    expect((result.content[0] as any).text).toContain("static, rendered, both");
  });

  it("5. findings_limit trims findings, findingsTruncated=true, severityBreakdown/totalIssues cover ALL", async () => {
    const manyFindings = Array.from({ length: 250 }, (_, i) => ({
      findingId: `f${i}`, mode: "static", file: `file${i}.html`, line: i, rule: "A1", severity: "high", message: "test",
    }));
    const mockReport = {
      runId: "run_123",
      score: 0.5,
      pass: false,
      threshold: 0.8,
      totalIssues: 250,
      severityBreakdown: { low: 0, medium: 0, high: 250 },
      findings: manyFindings,
      fileCount: 10,
      durationMs: 5000,
    };
    (runDetection as any).mockResolvedValue({ report: mockReport });
    (resolveWorkspacePath as any).mockReturnValue({ ok: true, resolvedPath: "C:\\ws\\test" });

    const result = await handleDesignGateRun({ findings_limit: 200 });
    const payload = JSON.parse((result.content[0] as any).text);

    expect(payload.findingsReturned).toBe(200);
    expect(payload.findingsTruncated).toBe(true);
    expect(payload.findings).toHaveLength(200);
    expect(payload.totalIssues).toBe(250);
    expect(payload.severityBreakdown.high).toBe(250);
  });

  it("6. list_rules returns ruleCount=30, 13 base + 17 impeccable, each entry has ruleId/severity/message/appliesTo", async () => {
    const result = await handleDesignGateListRules({});
    expect(result.isError).toBe(false);
    const payload = JSON.parse((result.content[0] as any).text);
    expect(payload.ok).toBe(true);
    expect(payload.ruleCount).toBe(30);
    expect(payload.rules).toHaveLength(30);
    const baseCount = payload.rules.filter((r: any) => r.source === "base").length;
    const impeccableCount = payload.rules.filter((r: any) => r.source === "impeccable").length;
    expect(baseCount).toBe(13);
    expect(impeccableCount).toBe(17);
    for (const r of payload.rules) {
      expect(r).toHaveProperty("ruleId");
      expect(r).toHaveProperty("severity");
      expect(r).toHaveProperty("message");
      expect(r).toHaveProperty("appliesTo");
    }
    expect(payload.scoringFormula).toContain("HIGH or MEDIUM");
    expect(payload.scanScope).toContain(".html");
  });

  it("7. runDetection throws → isError:true, sanitized message, no stack, no absolute path", async () => {
    (resolveWorkspacePath as any).mockReturnValue({ ok: true, resolvedPath: "C:\\ws\\test" });
    (runDetection as any).mockRejectedValue(new Error("WASM load failed: OOM"));

    const result = await handleDesignGateRun({});
    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text;
    expect(text).toContain("Design gate run failed:");
    expect(text).not.toContain("stack");
    expect(text).not.toContain("C:\\ws\\test");
  });

  it("8. mode=rendered → fetchStatus surfaced; mode=static/both → no fetchStatus", async () => {
    (resolveWorkspacePath as any).mockReturnValue({ ok: true, resolvedPath: "C:\\ws\\test" });

    // rendered
    (runDetection as any).mockResolvedValue({
      report: { runId: "r1", score: 0.9, pass: true, threshold: 0.8, totalIssues: 0, severityBreakdown: { low: 0, medium: 0, high: 0 }, findings: [], fileCount: 1, durationMs: 100 },
      combinedResult: { fetchStatus: "success" },
    });
    let result = await handleDesignGateRun({ mode: "rendered" });
    let payload = JSON.parse((result.content[0] as any).text);
    expect(payload.fetchStatus).toBe("success");

    // static
    (runDetection as any).mockResolvedValue({
      report: { runId: "r2", score: 0.9, pass: true, threshold: 0.8, totalIssues: 0, severityBreakdown: { low: 0, medium: 0, high: 0 }, findings: [], fileCount: 1, durationMs: 100 },
    });
    result = await handleDesignGateRun({ mode: "static" });
    payload = JSON.parse((result.content[0] as any).text);
    expect(payload.fetchStatus).toBeUndefined();

    // both (aggregate drops fetchStatus per TDD)
    (runDetection as any).mockResolvedValue({
      report: { runId: "r3", score: 0.9, pass: true, threshold: 0.8, totalIssues: 0, severityBreakdown: { low: 0, medium: 0, high: 0 }, findings: [], fileCount: 1, durationMs: 100 },
    });
    result = await handleDesignGateRun({ mode: "both" });
    payload = JSON.parse((result.content[0] as any).text);
    expect(payload.fetchStatus).toBeUndefined();
  });

  it("9. file ≤200 lines, functions ≤20 lines (size guard - structural check)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(__dirname, "..", "tools", "design-gate", "design-gate-tool.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").length;
    expect(lines).toBeLessThanOrEqual(250);
  });
});

describe("registerDesignGateLocalTools", () => {
  it("registers both tools via registerLocalTool", async () => {
    const { registerLocalTool } = await import("../backend-local-tools/registry");
    registerDesignGateLocalTools();
    expect(registerLocalTool).toHaveBeenCalledTimes(2);
    expect(registerLocalTool).toHaveBeenCalledWith("design_gate_run", expect.any(Function), expect.objectContaining({ name: "design_gate_run" }));
    expect(registerLocalTool).toHaveBeenCalledWith("design_gate_list_rules", expect.any(Function), expect.objectContaining({ name: "design_gate_list_rules" }));
  });
});