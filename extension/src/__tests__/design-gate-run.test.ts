/**
 * SA4E-393 — design_gate_run handler unit tests (runDetection and PathResolver mocked).
 * BUG-SA4E-393: NO global `vscode` stub — the handler must not depend on one.
 * SEC-F08: the workspace root travels as `workspaceRoot` — never via process env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MOCK_WS_ROOT, MOCK_EXTENSION_PATH, slashModuleMock, pathResolverMock,
  makeReport, makeFindings, payloadOf, textOf, ToolResult,
} from "./design-gate-tools.fixtures";

vi.mock("../slash", async () => (await import("./design-gate-tools.fixtures")).slashModuleMock(vi.fn()));
vi.mock("../services/PathResolver", async () => (await import("./design-gate-tools.fixtures")).pathResolverMock(vi.fn()));
vi.mock("../slash/detector-env", () => ({ resolveWasmPath: vi.fn() }));
vi.mock("../backend-local-tools/registry", () => ({ registerLocalTool: vi.fn() }));

import { handleDesignGateRun } from "../tools/design-gate/design-gate-tool";
import { runDetection } from "../slash";
import { resolveWorkspacePath } from "../services/PathResolver";
import { resolveWasmPath } from "../slash/detector-env";
import { initDesignGateEnv } from "../tools/design-gate/design-gate-env";

const detect = runDetection as unknown as ReturnType<typeof vi.fn>;
const resolvePath = resolveWorkspacePath as unknown as ReturnType<typeof vi.fn>;
/** WHY: handler is typed unknown (LocalToolHandler); narrow once to the real result shape. */
const run = async (a: Record<string, unknown>) => (await handleDesignGateRun(a)) as ToolResult;

beforeEach(() => {
  vi.clearAllMocks();
  delete (globalThis as any).vscode;
  delete process.env.WORKSPACE_ROOT;
  initDesignGateEnv(MOCK_EXTENSION_PATH);
  resolvePath.mockReturnValue({ ok: true, resolvedPath: MOCK_WS_ROOT });
});
afterEach(() => vi.restoreAllMocks());

describe("design_gate_run handler", () => {
  it("0. root travels explicitly (workspaceRoot), env stays unset, WASM from EXTENSION path", async () => {
    detect.mockResolvedValue({ report: makeReport() });
    await run({ mode: "static" });
    expect(process.env.WORKSPACE_ROOT).toBeUndefined();
    expect(resolveWasmPath).toHaveBeenCalledWith(MOCK_EXTENSION_PATH);
    expect(detect).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRoot: MOCK_WS_ROOT, workspaceRoot: MOCK_WS_ROOT }));
  });

  it("1. mode=both returns the full report schema", async () => {
    const findings = [...makeFindings(4, "high"), ...makeFindings(3, "medium"), ...makeFindings(3, "low")];
    detect.mockResolvedValue({ report: makeReport({
      runId: "run_123", score: 0.75, pass: false, totalIssues: 10, findings, fileCount: 42, durationMs: 8123,
      severityBreakdown: { low: 3, medium: 3, high: 4 },
    }) });
    const result = await run({ mode: "both", threshold: 0.8 });
    const p = payloadOf(result);
    expect(result.isError).toBe(false);
    expect([p.ok, p.runId, p.detectionMode, p.score, p.pass]).toEqual([true, "run_123", "both", 0.75, false]);
    expect([p.totalIssues, p.findingsReturned, p.findingsTruncated]).toEqual([10, 10, false]);
    expect(p.severityBreakdown).toEqual({ low: 3, medium: 3, high: 4 });
    expect([p.fileCount, p.durationMs]).toEqual([42, 8123]);
  });

  it("2. source_path outside workspace → isError, PathResolver message, runDetection NOT called", async () => {
    resolvePath.mockReturnValue({ ok: false, message: "PATH_REJECTED_OUTSIDE_WORKSPACE: outside workspace root" });
    const result = await run({ source_path: "C:\\outside\\file.html" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("PATH_REJECTED_OUTSIDE_WORKSPACE");
    expect(detect).not.toHaveBeenCalled();
  });

  it("3a. threshold override is reported", async () => {
    detect.mockResolvedValueOnce({ report: makeReport({ threshold: 0.9 }) });
    expect(payloadOf(await run({ threshold: 0.9 })).threshold).toBe(0.9);
  });

  it("3b. omitted threshold → DEFAULT_THRESHOLD (0.8)", async () => {
    detect.mockResolvedValueOnce({ report: makeReport() });
    expect(payloadOf(await run({})).threshold).toBe(0.8);
  });

  it("3c. threshold 1.5 / -0.1 → validation error", async () => {
    const high = await run({ threshold: 1.5 });
    expect(high.isError).toBe(true);
    expect(textOf(high)).toContain("threshold must be in [0, 1]");
    expect((await run({ threshold: -0.1 })).isError).toBe(true);
  });

  it("4. invalid mode (statics) → validation error listing allowed values", async () => {
    const result = await run({ mode: "statics" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid mode");
    expect(textOf(result)).toContain("static, rendered, both");
  });

  it("5. findings_limit trims findings; totals still cover ALL", async () => {
    detect.mockResolvedValue({ report: makeReport({
      totalIssues: 250, findings: makeFindings(250), severityBreakdown: { low: 0, medium: 0, high: 250 },
    }) });
    const p = payloadOf(await run({ findings_limit: 200 }));
    expect([p.findingsReturned, p.findingsTruncated, p.findings.length]).toEqual([200, true, 200]);
    expect([p.totalIssues, p.severityBreakdown.high]).toEqual([250, 250]);
  });

  it("7. runDetection throws → isError, sanitized message, no stack, no absolute path", async () => {
    detect.mockRejectedValue(new Error("WASM load failed: OOM"));
    const result = await run({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Design gate run failed:");
    expect(textOf(result)).not.toContain("stack");
    expect(textOf(result)).not.toContain(MOCK_WS_ROOT);
  });
});

describe("design_gate_run fetchStatus (8)", () => {
  it("8a. mode=rendered surfaces fetchStatus", async () => {
    detect.mockResolvedValue({ report: makeReport(), combinedResult: { fetchStatus: "success" } });
    expect(payloadOf(await run({ mode: "rendered" })).fetchStatus).toBe("success");
  });

  it.each(["static", "both"])("8b. mode=%s → no fetchStatus (aggregate drops it per TDD)", async (mode) => {
    detect.mockResolvedValue({ report: makeReport() });
    expect(payloadOf(await run({ mode })).fetchStatus).toBeUndefined();
  });
});
