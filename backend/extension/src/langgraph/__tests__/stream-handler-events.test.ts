/**
 * StreamHandler Event Tests — KSA-233
 * Tests that emitRetry, emitVerify, emitStrategySwitch, and
 * emitHumanIntervention emit correct event format.
 */
import { describe, it, expect, vi } from "vitest";
import { StreamHandler } from "../stream-handler";

// --- Tests ---

describe("StreamHandler Self-Correction Events (KSA-233)", () => {
  it("TC-14: emitRetry emits correct event format", () => {
    const emitFn = vi.fn();
    const handler = new StreamHandler(emitFn);

    handler.emitRetry("ba_brd", 1, 2, 1000, "Network timeout", "stream-123");

    expect(emitFn).toHaveBeenCalledTimes(1);
    const event = emitFn.mock.calls[0][0];
    expect(event).toMatchObject({
      type: "chat:streamChunk",
      streamId: "stream-123",
      nodeId: "ba_brd",
      eventType: "retry",
    });
    const content = JSON.parse(event.content);
    expect(content).toEqual({
      attempt: 1,
      maxAttempts: 2,
      delayMs: 1000,
      error: "Network timeout",
    });
    expect(event.timestamp).toBeDefined();
  });

  it("TC-14: emitVerify emits correct event format", () => {
    const emitFn = vi.fn();
    const handler = new StreamHandler(emitFn);

    handler.emitVerify(
      "verify_ba_brd", false, "Missing acceptance criteria", 2, "stream-456"
    );

    expect(emitFn).toHaveBeenCalledTimes(1);
    const event = emitFn.mock.calls[0][0];
    expect(event).toMatchObject({
      type: "chat:streamChunk",
      streamId: "stream-456",
      nodeId: "verify_ba_brd",
      eventType: "verify",
    });
    const content = JSON.parse(event.content);
    expect(content).toEqual({
      passed: false,
      feedback: "Missing acceptance criteria",
      attempt: 2,
    });
    expect(event.timestamp).toBeDefined();
  });

  it("TC-14: emitVerify with pass emits null feedback", () => {
    const emitFn = vi.fn();
    const handler = new StreamHandler(emitFn);

    handler.emitVerify("verify_sa_tdd", true, null, 1, "stream-789");

    const event = emitFn.mock.calls[0][0];
    const content = JSON.parse(event.content);
    expect(content).toEqual({
      passed: true,
      feedback: null,
      attempt: 1,
    });
  });

  it("TC-14: emitStrategySwitch emits correct event format", () => {
    const emitFn = vi.fn();
    const handler = new StreamHandler(emitFn);

    handler.emitStrategySwitch(
      "ba_brd", "primary", "alternate", "2 verify failures", "stream-abc"
    );

    expect(emitFn).toHaveBeenCalledTimes(1);
    const event = emitFn.mock.calls[0][0];
    expect(event).toMatchObject({
      type: "chat:streamChunk",
      streamId: "stream-abc",
      nodeId: "ba_brd",
      eventType: "strategy_switch",
    });
    const content = JSON.parse(event.content);
    expect(content).toEqual({
      fromStrategy: "primary",
      toStrategy: "alternate",
      reason: "2 verify failures",
    });
    expect(event.timestamp).toBeDefined();
  });

  it("TC-14: emitHumanIntervention emits correct event format", () => {
    const emitFn = vi.fn();
    const handler = new StreamHandler(emitFn);

    const failedStrategies = ["primary", "alternate"];
    const verifyHistory = [
      { attempt: 1, feedback: "Missing stories" },
      { attempt: 2, feedback: "Still incomplete" },
    ];

    handler.emitHumanIntervention(
      "ba_brd", failedStrategies, verifyHistory, "stream-xyz"
    );

    expect(emitFn).toHaveBeenCalledTimes(1);
    const event = emitFn.mock.calls[0][0];
    expect(event).toMatchObject({
      type: "chat:streamChunk",
      streamId: "stream-xyz",
      nodeId: "ba_brd",
      eventType: "human_intervention_required",
    });
    const content = JSON.parse(event.content);
    expect(content).toEqual({
      failedStrategies: ["primary", "alternate"],
      verifyHistory: [
        { attempt: 1, feedback: "Missing stories" },
        { attempt: 2, feedback: "Still incomplete" },
      ],
    });
    expect(event.timestamp).toBeDefined();
  });

  it("emitRetry generates streamId when null", () => {
    const emitFn = vi.fn();
    const handler = new StreamHandler(emitFn);

    handler.emitRetry("ba_brd", 1, 2, 1000, "error", null);

    const event = emitFn.mock.calls[0][0];
    expect(event.streamId).toMatch(/^stream-ba_brd-\d+$/);
  });

  it("events flush pending buffer before emitting", () => {
    const emitFn = vi.fn();
    const handler = new StreamHandler(emitFn);

    // Add a token to buffer first
    handler.emitToken("ba_brd", "hello", "stream-1");
    // emitRetry should flush that token first
    handler.emitRetry("ba_brd", 1, 2, 1000, "err", "stream-1");

    // First call = flushed token, second call = retry event
    expect(emitFn).toHaveBeenCalledTimes(2);
    expect(emitFn.mock.calls[0][0].eventType).toBe("token");
    expect(emitFn.mock.calls[1][0].eventType).toBe("retry");
  });
});
