/**
 * SA4E-393 — design_gate_list_rules + registerDesignGateLocalTools unit tests.
 * Design rules are mocked: 13 base + 17 impeccable (fixtures).
 */
import { describe, it, expect, vi } from "vitest";
import { payloadOf, ToolResult } from "./design-gate-tools.fixtures";

vi.mock("../slash", async () => (await import("./design-gate-tools.fixtures")).slashModuleMock(vi.fn()));
vi.mock("../services/PathResolver", async () => (await import("./design-gate-tools.fixtures")).pathResolverMock(vi.fn()));
vi.mock("../slash/detector-env", () => ({ resolveWasmPath: vi.fn() }));
vi.mock("../slash/design-rules", async () => (await import("./design-gate-tools.fixtures")).rulesModuleMock());
vi.mock("../backend-local-tools/registry", () => ({ registerLocalTool: vi.fn() }));

import { handleDesignGateListRules, registerDesignGateLocalTools } from "../tools/design-gate/design-gate-tool";

/** WHY: handler is typed unknown (LocalToolHandler); narrow once to the real result shape. */
const list = () => handleDesignGateListRules({}) as ToolResult;
describe("design_gate_list_rules", () => {
  it("6. returns ruleCount=30 (13 base + 17 impeccable)", async () => {
    const result = await list();
    const p = payloadOf(result);
    expect(result.isError).toBe(false);
    expect([p.ok, p.ruleCount, p.rules.length]).toEqual([true, 30, 30]);
    expect(p.rules.filter((r: any) => r.source === "base")).toHaveLength(13);
    expect(p.rules.filter((r: any) => r.source === "impeccable")).toHaveLength(17);
  });

  it("6b. every entry has ruleId/severity/message/appliesTo; formula + scope are described", async () => {
    const p = payloadOf(await list());
    for (const r of p.rules) {
      expect(Object.keys(r)).toEqual(expect.arrayContaining(["ruleId", "severity", "message", "appliesTo"]));
    }
    expect(p.scoringFormula).toContain("HIGH or MEDIUM");
    expect(p.scanScope).toContain(".html");
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
