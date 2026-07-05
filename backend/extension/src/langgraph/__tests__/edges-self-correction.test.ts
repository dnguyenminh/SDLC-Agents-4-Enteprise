/**
 * Edge Routing Tests — KSA-233 Self-Correction
 * Tests routeAfterVerify and routeAfterStrategySwitch conditional edges.
 */
import { describe, it, expect } from "vitest";
import { routeAfterVerify, routeAfterStrategySwitch } from "../edges";
import type { PipelineState } from "../state";

// --- Helpers ---

function createBaseState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    ticketKey: "KSA-233",
    threadId: "thread-1",
    currentPhase: "requirements",
    intent: "sdlc",
    pipelineStatus: "running",
    resumePoint: null,
    documents: {},
    agentOutputs: [],
    currentStreamId: "stream-test",
    approvalRequired: false,
    approvalDecision: null,
    userFeedback: null,
    pendingApprovals: [],
    chatHistory: [],
    errors: [],
    retryCount: {},
    createdAt: "2026-01-01T00:00:00Z",
    lastUpdatedAt: "2026-01-01T00:00:00Z",
    lastCheckpointAt: null,
    feedbackIterations: 0,
    maxFeedbackIterations: 5,
    discrepancyFound: false,
    previousNode: null,
    parallelResults: {},
    qualityGateResults: {},
    toolCalls: null,
    toolResults: [],
    agentIterations: 0,
    verifyPassed: true,
    verifyFeedback: null,
    verifyAttempts: {},
    maxVerifyAttempts: 2,
    activeStrategy: {},
    strategyHistory: [],
    ...overrides,
  } as PipelineState;
}

// --- Tests ---

describe("routeAfterVerify (KSA-233)", () => {
  const routeFn = routeAfterVerify("ba_brd", "quality_gate_requirements");

  it("pass → routes to nextNodeId", () => {
    const state = createBaseState({ verifyPassed: true });
    expect(routeFn(state)).toBe("quality_gate_requirements");
  });

  it("fail + attempts < max → routes back to targetNodeId", () => {
    const state = createBaseState({
      verifyPassed: false,
      verifyAttempts: { ba_brd: 1 },
      maxVerifyAttempts: 2,
    });
    expect(routeFn(state)).toBe("ba_brd");
  });

  it("fail + attempts >= max → routes to 'strategy_switch'", () => {
    const state = createBaseState({
      verifyPassed: false,
      verifyAttempts: { ba_brd: 2 },
      maxVerifyAttempts: 2,
    });
    expect(routeFn(state)).toBe("strategy_switch");
  });

  it("fail + attempts > max → still routes to 'strategy_switch'", () => {
    const state = createBaseState({
      verifyPassed: false,
      verifyAttempts: { ba_brd: 5 },
      maxVerifyAttempts: 2,
    });
    expect(routeFn(state)).toBe("strategy_switch");
  });

  it("pipeline failed → routes to '__end__'", () => {
    const state = createBaseState({
      pipelineStatus: "failed",
      verifyPassed: false,
    });
    expect(routeFn(state)).toBe("__end__");
  });

  it("default maxVerifyAttempts (2) when state has no value", () => {
    const state = createBaseState({
      verifyPassed: false,
      verifyAttempts: { ba_brd: 1 },
    });
    // maxVerifyAttempts defaults to 2, attempts=1 < 2 → back to agent
    // Remove explicit maxVerifyAttempts to test default
    delete (state as any).maxVerifyAttempts;
    expect(routeFn(state)).toBe("ba_brd");
  });
});

describe("routeAfterStrategySwitch (KSA-233)", () => {
  it("alternate strategy active → routes to targetNodeId", () => {
    const state = createBaseState({
      pipelineStatus: "running",
      activeStrategy: { ba_brd: "alternate" },
    });
    expect(routeAfterStrategySwitch(state)).toBe("ba_brd");
  });

  it("pipeline paused → routes to '__end__'", () => {
    const state = createBaseState({
      pipelineStatus: "paused",
      activeStrategy: { ba_brd: "alternate" },
    });
    expect(routeAfterStrategySwitch(state)).toBe("__end__");
  });

  it("no active alternate strategy → routes to '__end__'", () => {
    const state = createBaseState({
      pipelineStatus: "running",
      activeStrategy: { ba_brd: "primary" },
    });
    expect(routeAfterStrategySwitch(state)).toBe("__end__");
  });

  it("empty activeStrategy → routes to '__end__'", () => {
    const state = createBaseState({
      pipelineStatus: "running",
      activeStrategy: {},
    });
    expect(routeAfterStrategySwitch(state)).toBe("__end__");
  });

  it("multiple nodes — returns first with 'alternate'", () => {
    const state = createBaseState({
      pipelineStatus: "running",
      activeStrategy: { ba_brd: "primary", sa_tdd: "alternate" },
    });
    expect(routeAfterStrategySwitch(state)).toBe("sa_tdd");
  });
});
