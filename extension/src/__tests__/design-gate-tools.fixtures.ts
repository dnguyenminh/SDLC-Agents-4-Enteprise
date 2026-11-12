/**
 * SA4E-393 — shared fixtures for the design_gate_run / design_gate_list_rules
 * unit tests (design-gate-run.test.ts, design-gate-rules-registry.test.ts).
 * vi.mock() calls must stay in each test file (hoisting); only data lives here.
 */

export const MOCK_WS_ROOT = "C:\\ws\\test";
export const MOCK_EXTENSION_PATH = "C:\\ext\\dnguyenminh.sdlc-agents-4-enterprise";

/** Mock of the "../slash" barrel: runDetection stub + env keys + default threshold. */
export function slashModuleMock(runDetection: unknown): Record<string, unknown> {
  return {
    runDetection,
    EnvConfig: {
      WORKSPACE_ROOT: "WORKSPACE_ROOT",
      IMPPECABLE_SKILL_PATH: "IMPPECABLE_SKILL_PATH",
      QUALITY_GATE_THRESHOLD: "QUALITY_GATE_THRESHOLD",
    },
    DEFAULT_THRESHOLD: 0.8,
  };
}

/** Mock of "../services/PathResolver" with the live workspace root = MOCK_WS_ROOT. */
export function pathResolverMock(fn: () => unknown): Record<string, unknown> {
  return {
    resolveWorkspacePath: fn,
    sanitizeLogText: (s: string) => s,
    defaultWorkspaceRootProvider: () => MOCK_WS_ROOT,
  };
}

type Sev = "low" | "medium" | "high";

function rule(id: string, severity: Sev, extensions: string[], label: string) {
  return { id, severity, extensions, label, check: () => [] };
}

/** 13 base rules + 17 impeccable rules (30 total) for the registry test. */
export function rulesModuleMock(): Record<string, unknown> {
  const base = [
    ...["A1", "A2", "A3"].map((id) => rule(id, "high", ["html"], `test rule ${id}`)),
    ...["B1", "B2", "B3"].map((id) => rule(id, "medium", ["css"], `test rule ${id}`)),
    ...["C1", "C2", "C3"].map((id) => rule(id, "low", ["tsx"], `test rule ${id}`)),
    ...["D1", "D2", "D3", "D4"].map((id) => rule(id, "high", ["html"], `test rule ${id}`)),
  ];
  const impeccable = Array.from({ length: 17 }, (_, i) =>
    rule(`imp${i + 1}`, i < 5 ? "low" : i < 12 ? "medium" : "high", ["html", "css"], `impeccable rule ${i + 1}`));
  return { DESIGN_RULES: [...base, ...impeccable], DesignRule: {}, RuleSeverity: {} };
}

/** A QualityReport-shaped object with sane defaults; override per test. */
export function makeReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: "r0", score: 0.9, pass: true, threshold: 0.8, totalIssues: 0,
    severityBreakdown: { low: 0, medium: 0, high: 0 }, findings: [], fileCount: 1, durationMs: 100,
    ...overrides,
  };
}

/** `count` static findings with the given severity (unique ids/files). */
export function makeFindings(count: number, severity: Sev = "high"): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) => ({
    findingId: `f${i + 1}`, mode: "static", file: `file${i}.html`, line: i + 1, rule: "A1", severity, message: "test",
  }));
}

/** Parse the JSON text payload of a tool result. */
export function payloadOf(result: { content: unknown[] }): any {
  return JSON.parse((result.content[0] as { text: string }).text);
}

/** Raw text of a tool result. */
export function textOf(result: { content: unknown[] }): string {
  return (result.content[0] as { text: string }).text;
}
