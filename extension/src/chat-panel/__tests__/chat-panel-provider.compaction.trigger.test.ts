/**
 * ChatPanelProvider Compaction tests (split from chat-panel-provider.compaction.test.ts).
 * SA4E-339 — trigger thresholds, webview broadcast, error resilience.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { normalizeUsageToFraction, SessionMonitor } from "../../pi-agent/session-compactor";
import { ContextUsageTracker } from "../context-usage-tracker";
import { createCompactionHarness } from "./compaction-helpers";

// Mock session-compactor to simulate compaction outcomes but keep normalizeUsageToFraction intact
vi.mock("../../pi-agent/session-compactor", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    SessionCompactor: class {
      compact = vi.fn().mockImplementation((session: any) => {
        if (session.messages.length === 0) {
          return { action: "none", tokensSaved: 0, session };
        }
        return {
          action: "compact",
          tokensSaved: 5000,
          session: {
            ...session,
            messages: [
              { role: "user", content: "[compaction] Simulated summary" },
              ...session.messages.slice(-2)
            ]
          }
        };
      });
    }
  };
});

describe("ChatPanelProvider Compaction (SA4E-339)", () => {
  let provider: any;
  let mockEngine: any;
  let webviewMessages: any[] = [];

  beforeEach(() => {
    const harness = createCompactionHarness();
    provider = harness.provider;
    mockEngine = harness.mockEngine;
    webviewMessages = harness.webviewMessages;
  });

  it("STC-339-01: Safe Usage (< 80%) No Compaction", () => {
    mockEngine.getChatHistory.mockReturnValue([{ role: "user", content: "msg1" }, { role: "assistant", content: "msg2" }]);
    provider.contextUsageTracker.getUsagePayload.mockReturnValue({
      total: { tokens: 12800, percentage: 10 },
      maxTokens: 128000,
      conversation: { tokens: 12800, percentage: 10 },
      mcpTools: { tokens: 0, percentage: 0 },
      steering: { tokens: 0, percentage: 0 },
    });

    provider.updateContextUsageAfterTurn();

    expect(mockEngine.setChatHistory).not.toHaveBeenCalled();
    expect(provider.sessionCompactor.compact).not.toHaveBeenCalled();
  });

  it("STC-339-02: High Usage (>= 95%) Triggers Compaction", () => {
    mockEngine.getChatHistory.mockReturnValue([
      { role: "user", content: "msg1" },
      { role: "assistant", content: "msg2" },
      { role: "user", content: "msg3" }
    ]);
    provider.contextUsageTracker.getUsagePayload.mockReturnValue({
      total: { tokens: 125000, percentage: 98 },
      maxTokens: 128000,
      conversation: { tokens: 125000, percentage: 98 },
      mcpTools: { tokens: 0, percentage: 0 },
      steering: { tokens: 0, percentage: 0 },
    });

    provider.updateContextUsageAfterTurn();

    expect(provider.sessionCompactor.compact).toHaveBeenCalled();
    expect(mockEngine.setChatHistory).toHaveBeenCalled();
  });

  it("STC-339-03: Webview Context Meter Broadcast", () => {
    mockEngine.getChatHistory.mockReturnValue([
      { role: "user", content: "msg1" },
      { role: "assistant", content: "msg2" },
      { role: "user", content: "msg3" }
    ]);
    provider.contextUsageTracker.getUsagePayload.mockReturnValue({
      total: { tokens: 125000, percentage: 98 },
      maxTokens: 128000,
      conversation: { tokens: 125000, percentage: 98 },
      mcpTools: { tokens: 0, percentage: 0 },
      steering: { tokens: 0, percentage: 0 },
    });

    provider.updateContextUsageAfterTurn();

    const updateMsg = webviewMessages.find(m => m.type === "tab:contextUpdate");
    expect(updateMsg).toBeDefined();
    expect(updateMsg.payload.tokenCount).toBeDefined();
  });

  it("STC-339-04: Error Resilience", () => {
    mockEngine.getChatHistory.mockReturnValue([
      { role: "user", content: "msg1" },
      { role: "assistant", content: "msg2" },
      { role: "user", content: "msg3" }
    ]);
    provider.contextUsageTracker.getUsagePayload.mockReturnValue({
      total: { tokens: 125000, percentage: 98 },
      maxTokens: 128000,
      conversation: { tokens: 125000, percentage: 98 },
      mcpTools: { tokens: 0, percentage: 0 },
      steering: { tokens: 0, percentage: 0 },
    });

    mockEngine.setChatHistory.mockImplementation(() => { throw new Error("Mock Error"); });

    // Should not throw an unhandled exception
    expect(() => provider.updateContextUsageAfterTurn()).not.toThrow();
  });

  it("STC-339-05: Boundary 94.5% usage rounds to 0.95 and triggers compaction", () => {
    // Real tracker semantics (context-usage-tracker.ts):
    //   percentage = Math.round((total / maxTokens) * 100)
    // Raw usage 120960/128000 = 94.5% is rounded UP to integer 95 before
    // normalizeUsageToFraction sees it → fraction 0.95 === COMPACT_USAGE_THRESHOLD.
    const realTracker = new ContextUsageTracker(128000);
    // estimateTokens = ceil(len / 4) → 120960 tokens (raw usage exactly 94.5%)
    realTracker.updateFromMessages("boundary-tab", [{ content: "x".repeat(120960 * 4) }]);
    const realPayload = realTracker.getUsagePayload("boundary-tab");
    expect(realPayload.total.tokens).toBe(120960);
    expect(realPayload.total.percentage).toBe(95); // Math.round(94.5) === 95

    const fraction = normalizeUsageToFraction(realPayload.total.percentage);
    expect(fraction).toBe(0.95); // boundary sits exactly on the threshold
    expect(SessionMonitor.shouldCompact(fraction)).toBe("compact");

    // Provider path with the real rounded payload → compaction triggers
    mockEngine.getChatHistory.mockReturnValue([
      { role: "user", content: "msg1" },
      { role: "assistant", content: "msg2" },
      { role: "user", content: "msg3" }
    ]);
    provider.contextUsageTracker.getUsagePayload.mockReturnValue(realPayload);

    provider.updateContextUsageAfterTurn();
    expect(provider.sessionCompactor.compact).toHaveBeenCalled();
  });
});
