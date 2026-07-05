/**
 * TokenCounter Tests — KSA-240
 */

import { describe, it, expect } from "vitest";
import { TokenCounter } from "../token-counter";

describe("TokenCounter", () => {
  const counter = new TokenCounter();

  describe("countMessageTokens", () => {
    it("should estimate tokens from content length", () => {
      // ~4 chars per token + 4 overhead
      const tokens = counter.countMessageTokens("Hello world"); // 11 chars
      expect(tokens).toBe(Math.ceil(11 / 4) + 4); // 3 + 4 = 7
    });

    it("should return 0 for empty content", () => {
      expect(counter.countMessageTokens("")).toBe(0);
    });

    it("should handle long content", () => {
      const content = "a".repeat(1000);
      const tokens = counter.countMessageTokens(content);
      expect(tokens).toBe(Math.ceil(1000 / 4) + 4); // 254
    });
  });

  describe("getUsagePercentage", () => {
    it("should calculate correct percentage", () => {
      expect(counter.getUsagePercentage(50000, 100000)).toBe(50);
      expect(counter.getUsagePercentage(80000, 100000)).toBe(80);
      expect(counter.getUsagePercentage(0, 100000)).toBe(0);
    });

    it("should cap at 100%", () => {
      expect(counter.getUsagePercentage(150000, 100000)).toBe(100);
    });

    it("should handle zero maxTokens", () => {
      expect(counter.getUsagePercentage(100, 0)).toBe(0);
    });
  });

  describe("getThresholdState", () => {
    it("should return safe for < 60%", () => {
      expect(counter.getThresholdState(0)).toBe("safe");
      expect(counter.getThresholdState(30)).toBe("safe");
      expect(counter.getThresholdState(59)).toBe("safe");
    });

    it("should return warning for 60-79%", () => {
      expect(counter.getThresholdState(60)).toBe("warning");
      expect(counter.getThresholdState(70)).toBe("warning");
      expect(counter.getThresholdState(79)).toBe("warning");
    });

    it("should return critical for 80-94%", () => {
      expect(counter.getThresholdState(80)).toBe("critical");
      expect(counter.getThresholdState(90)).toBe("critical");
      expect(counter.getThresholdState(94)).toBe("critical");
    });

    it("should return full for >= 95%", () => {
      expect(counter.getThresholdState(95)).toBe("full");
      expect(counter.getThresholdState(100)).toBe("full");
    });
  });

  describe("getMaxTokensForModel", () => {
    it("should return known model limits", () => {
      expect(counter.getMaxTokensForModel("gpt-4o")).toBe(128000);
      expect(counter.getMaxTokensForModel("claude-sonnet-4-20250514")).toBe(200000);
    });

    it("should return default for unknown models", () => {
      expect(counter.getMaxTokensForModel("unknown-model")).toBe(128000);
    });
  });

  describe("custom thresholds", () => {
    it("should respect custom config", () => {
      const custom = new TokenCounter({
        warningThreshold: 0.5,
        criticalThreshold: 0.7,
        fullThreshold: 0.9,
      });
      expect(custom.getThresholdState(50)).toBe("warning");
      expect(custom.getThresholdState(70)).toBe("critical");
      expect(custom.getThresholdState(90)).toBe("full");
    });
  });
});
