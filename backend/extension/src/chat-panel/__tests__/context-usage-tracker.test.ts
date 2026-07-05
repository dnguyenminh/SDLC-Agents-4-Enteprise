/**
 * ContextUsageTracker Tests — KSA-249
 * Covers: TC-CUG-001 to TC-CUG-009 (9 UT cases)
 * Pure logic — no vscode mock needed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ContextUsageTracker } from "../context-usage-tracker";

describe("ContextUsageTracker (KSA-249)", () => {
  let tracker: ContextUsageTracker;

  beforeEach(() => {
    tracker = new ContextUsageTracker(128000);
  });

  // TC-CUG-001: Token Estimation Accuracy
  describe("TC-CUG-001: Token Estimation", () => {
    it("estimates 'Hello world' (11 chars) as 3 tokens", () => {
      tracker.updateFromMessages("tab1", [{ content: "Hello world" }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.conversation.tokens).toBe(3); // ceil(11/4)
    });

    it("estimates empty string as 0 tokens", () => {
      tracker.updateFromMessages("tab1", [{ content: "" }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.conversation.tokens).toBe(0);
    });

    it("estimates 1000 chars as 250 tokens", () => {
      const longStr = "a".repeat(1000);
      tracker.updateFromMessages("tab1", [{ content: longStr }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.conversation.tokens).toBe(250); // ceil(1000/4)
    });
  });

  // TC-CUG-002: Context Usage Payload Calculation
  describe("TC-CUG-002: Payload Calculation", () => {
    it("calculates correct percentages for conversation=45000, mcp=12000, steering=3000", () => {
      // Set conversation tokens: need 45000 tokens → 45000*4 = 180000 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(180000) }]);
      // Set mcp tokens: 12000 → 48000 chars
      tracker.addToolTokens("tab1", "b".repeat(48000));
      // Set steering: 3000 → 12000 chars
      tracker.updateSteeringTokens("tab1", ["c".repeat(12000)]);

      const payload = tracker.getUsagePayload("tab1");
      expect(payload.conversation.tokens).toBe(45000);
      expect(payload.mcpTools.tokens).toBe(12000);
      expect(payload.steering.tokens).toBe(3000);
      expect(payload.total.tokens).toBe(60000);
      // percentage = round(60000/128000 * 100) = 47
      expect(payload.total.percentage).toBe(47);
      expect(payload.total.threshold).toBe("safe");
    });
  });

  // TC-CUG-003: Empty Tab Usage
  describe("TC-CUG-003: Empty Tab", () => {
    it("returns zeros for new tab with only steering", () => {
      // steering 2000 tokens → 8000 chars
      tracker.updateSteeringTokens("tab1", ["x".repeat(8000)]);
      const payload = tracker.getUsagePayload("tab1");

      expect(payload.conversation.tokens).toBe(0);
      expect(payload.mcpTools.tokens).toBe(0);
      expect(payload.steering.tokens).toBe(2000);
      expect(payload.total.tokens).toBe(2000);
      // round(2000/128000*100) = 2
      expect(payload.total.percentage).toBe(2);
      expect(payload.total.threshold).toBe("safe");
    });
  });

  // TC-CUG-004: Tab Switch Updates Usage (UT-level: per-tab isolation)
  describe("TC-CUG-004: Tab Isolation", () => {
    it("returns different data for different tabs", () => {
      // Tab A: 50000 tokens → 200000 chars
      tracker.updateFromMessages("tabA", [{ content: "a".repeat(200000) }]);
      // Tab B: 10000 tokens → 40000 chars
      tracker.updateFromMessages("tabB", [{ content: "b".repeat(40000) }]);

      const payloadA = tracker.getUsagePayload("tabA");
      const payloadB = tracker.getUsagePayload("tabB");

      expect(payloadA.total.tokens).toBe(50000);
      expect(payloadB.total.tokens).toBe(10000);
    });
  });

  // TC-CUG-005: Large Token Count Formatting (logic test: percentage rounding)
  describe("TC-CUG-005: Percentage Rounding", () => {
    it("rounds percentage correctly for large token counts", () => {
      // 45231 tokens → 180924 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(180924) }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.conversation.tokens).toBe(45231);
      // round(45231/128000*100) = 35
      expect(payload.conversation.percentage).toBe(35);
    });
  });

  // TC-CUG-006: Safe Threshold (0-59%)
  describe("TC-CUG-006: Safe Threshold", () => {
    it("returns 'safe' for 47% usage", () => {
      // 47% of 128000 = 60160 tokens → 240640 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(240640) }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.total.threshold).toBe("safe");
    });
  });

  // TC-CUG-007: Warning Threshold (60-79%)
  describe("TC-CUG-007: Warning Threshold", () => {
    it("returns 'warning' for 60% usage", () => {
      // 60% of 128000 = 76800 tokens → 307200 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(307200) }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.total.percentage).toBe(60);
      expect(payload.total.threshold).toBe("warning");
    });

    it("returns 'warning' for 79% usage", () => {
      // 79% of 128000 = 101120 tokens → 404480 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(404480) }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.total.percentage).toBe(79);
      expect(payload.total.threshold).toBe("warning");
    });
  });

  // TC-CUG-008: Critical Threshold (80-94%)
  describe("TC-CUG-008: Critical Threshold", () => {
    it("returns 'critical' for 80% usage", () => {
      // 80% of 128000 = 102400 tokens → 409600 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(409600) }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.total.percentage).toBe(80);
      expect(payload.total.threshold).toBe("critical");
    });

    it("returns 'critical' for 94% usage", () => {
      // 94% of 128000 = 120320 tokens → 481280 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(481280) }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.total.percentage).toBe(94);
      expect(payload.total.threshold).toBe("critical");
    });
  });

  // TC-CUG-009: Full Threshold (95-100%)
  describe("TC-CUG-009: Full Threshold", () => {
    it("returns 'full' for 95% usage", () => {
      // 95% of 128000 = 121600 tokens → 486400 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(486400) }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.total.percentage).toBe(95);
      expect(payload.total.threshold).toBe("full");
    });

    it("returns 'full' for 100% usage", () => {
      // 100% of 128000 = 128000 tokens → 512000 chars
      tracker.updateFromMessages("tab1", [{ content: "a".repeat(512000) }]);
      const payload = tracker.getUsagePayload("tab1");
      expect(payload.total.percentage).toBe(100);
      expect(payload.total.threshold).toBe("full");
    });
  });
});
