/**
 * resolveMaxTokensFromEngine / resolveMaxTokens — SA4E-369 context-window chain.
 * The badge denominator must come from the resolved model's REAL context window
 * (registry first, probe meta.n_ctx fallback) — the hardcoded tracker default
 * 128000 is NEVER a source, only a last resort when both are absent.
 */
import { describe, it, expect } from "vitest";
import type { PiWorkflowAdapter } from "../../pi-workflow";
import {
  resolveMaxTokensFromEngine,
  resolveMaxTokens,
  type ContextUsageDeps,
} from "../chat-panel-provider/context-usage";
import { CountedFlags } from "../chat-panel-provider/counted-flags";

function engineOf(stub: Partial<PiWorkflowAdapter>): PiWorkflowAdapter {
  return stub as PiWorkflowAdapter;
}

function depsFrom(e: PiWorkflowAdapter): ContextUsageDeps {
  return {
    getOrCreateEngine: () => e,
    peekEngine: () => e,
    getTabId: () => "tab-1",
    getTracker: () => { throw new Error("tracker not needed by the resolver"); },
    getFlags: () => new CountedFlags(),
    getCompactor: () => { throw new Error("compactor not needed by the resolver"); },
    sendToWebview: () => undefined,
  };
}

describe("resolveMaxTokensFromEngine (SA4E-369)", () => {
  it("prefers the registry value (resolved model) over the probe", () => {
    const e = engineOf({
      getModelContextWindow: () => 65536,
      getDetectedContextWindow: () => 32768,
    });
    // Registry = per-model truth (e.g. gateway context_length); probe = shared
    // per-endpoint value — registry must win for the badge denominator.
    expect(resolveMaxTokensFromEngine(e)).toBe(65536);
  });

  it("falls back to the probe (meta.n_ctx) when the registry has no value", () => {
    const e = engineOf({
      getModelContextWindow: () => undefined,
      getDetectedContextWindow: () => 32768,
    });
    expect(resolveMaxTokensFromEngine(e)).toBe(32768);
  });

  it("ignores a non-positive registry value and uses the probe", () => {
    const e = engineOf({
      getModelContextWindow: () => 0,
      getDetectedContextWindow: () => 32768,
    });
    expect(resolveMaxTokensFromEngine(e)).toBe(32768);
  });

  it("returns undefined when both sources are absent (tracker keeps its default)", () => {
    const e = engineOf({
      getModelContextWindow: () => undefined,
      getDetectedContextWindow: () => undefined,
    });
    expect(resolveMaxTokensFromEngine(e)).toBeUndefined();
  });

  it("never fabricates the 128000 default as a source", () => {
    // SA4E-369: the bug was 128000 filling in for a real 65,536 window.
    const e = engineOf({
      getModelContextWindow: () => undefined,
      getDetectedContextWindow: () => 0,
    });
    expect(resolveMaxTokensFromEngine(e)).toBeUndefined();
  });

  it("degrades gracefully on a bare engine mock — no methods, no throw", () => {
    // Regression: resolveMaxTokens once called getModelContextWindow() without
    // optional chaining and crashed the per-turn accounting on bare mocks.
    const e = engineOf({});
    expect(() => resolveMaxTokensFromEngine(e)).not.toThrow();
    expect(resolveMaxTokensFromEngine(e)).toBeUndefined();
  });

  it("floors fractional windows", () => {
    const e = engineOf({
      getModelContextWindow: () => 65535.7,
    });
    expect(resolveMaxTokensFromEngine(e)).toBe(65535);
  });
});

describe("resolveMaxTokens(deps)", () => {
  it("resolves through the deps-provided engine", () => {
    const e = engineOf({
      getModelContextWindow: () => 65536,
      getDetectedContextWindow: () => 32768,
    });
    expect(resolveMaxTokens(depsFrom(e))).toBe(65536);
  });

  it("returns undefined when the deps engine has no window at all", () => {
    const e = engineOf({});
    expect(resolveMaxTokens(depsFrom(e))).toBeUndefined();
  });
});
