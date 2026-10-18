/**
 * ChatPanelProvider Compaction tests (split from chat-panel-provider.compaction.test.ts).
 * SA4E-339 — summary message contract, usage normalization, regression check.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
import { normalizeUsageToFraction } from "../../pi-agent/session-compactor";
import { formatSummaryMessage } from "../../pi-agent/summarizer";
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

  it("STC-339-06: Exactly 2 messages, usage >=95%", () => {
    mockEngine.getChatHistory.mockReturnValue([
      { role: "user", content: "msg1" },
      { role: "assistant", content: "msg2" }
    ]);
    provider.contextUsageTracker.getUsagePayload.mockReturnValue({
      total: { tokens: 125000, percentage: 98 },
      maxTokens: 128000,
      conversation: { tokens: 125000, percentage: 98 },
      mcpTools: { tokens: 0, percentage: 0 },
      steering: { tokens: 0, percentage: 0 },
    });

    provider.updateContextUsageAfterTurn();
    // length must be > 2 to compact
    expect(provider.sessionCompactor.compact).not.toHaveBeenCalled();
  });

  it("STC-339-07: Engine is null", () => {
    provider.engine = null;
    expect(() => provider.updateContextUsageAfterTurn()).not.toThrow();
    expect(provider.contextUsageTracker.getUsagePayload).not.toHaveBeenCalled();
  });

  it("STC-339-08: compact() returns action != compact", () => {
    provider.sessionCompactor.compact.mockReturnValueOnce({ action: "none", session: { messages: [] }, tokensSaved: 0 });

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
    expect(mockEngine.setChatHistory).not.toHaveBeenCalled();
  });

  it("STC-339-09: SEC-330-01 Role validation", () => {
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
    expect(mockEngine.setChatHistory).toHaveBeenCalled();
    const calls = mockEngine.setChatHistory.mock.calls[0][0];
    // Check first message is the summary and has role user + prefix [compaction]
    expect(calls[0].role).toBe("user");
    expect(calls[0].content).toContain("[compaction]");

    // Provider must pass the compactor's session through unchanged and never
    // re-label any persisted message as system (SEC-330-01 privilege guard).
    const compacted = provider.sessionCompactor.compact.mock.results[0].value.session.messages;
    expect(calls).toEqual(compacted);
    expect(calls.map((m: { role: string }) => m.role)).not.toContain("system");
    expect(calls).toHaveLength(3); // summary + last 2 messages

    // Real production formatter contract (summarizer.formatSummaryMessage):
    // summary is a user-role carrier with [compaction] prefix — never system.
    const summaryMsg = formatSummaryMessage({
      intent: "refactor auth flow",
      toolsUsed: ["read", "edit"],
      lastResponse: "Done: refactored login.",
    });
    expect(summaryMsg.role).toBe("user");
    expect(summaryMsg.content).toContain("[compaction]");
    expect(summaryMsg.role).not.toBe("system");
  });

  it("STC-339-10: SEC-330-02 Usage normalization", () => {
    const fraction = normalizeUsageToFraction(150); // 150%
    expect(fraction).toBeLessThanOrEqual(1.0);
    expect(fraction).toBeGreaterThanOrEqual(0.0);
  });

  it("STC-339-11: AC-05 Regression — pre-existing chat suite passes with 0 failures", () => {
    // STC-339-11 (AC-05): run the pre-existing __tests__/chat suite — must
    // report 0 test failures. Real regression check: spawn vitest as a child
    // process against src/__tests__/chat and assert exit status + pass counts.
    const extensionDir = path.resolve(__dirname, "../../..");
    const requireFromTests = createRequire(path.join(__dirname, "stc311-resolver.cjs"));
    const vitestManifest = requireFromTests.resolve("vitest/package.json");
    const vitestBin = path.join(path.dirname(vitestManifest), "vitest.mjs");

    // Strip nested-run env markers so the child boots a clean vitest instance.
    const env = { ...process.env };
    delete env.VITEST;
    delete env.VITEST_POOL_ID;
    delete env.VITEST_WORKER_ID;

    const result = spawnSync(process.execPath, [vitestBin, "run", "src/__tests__/chat"], {
      cwd: extensionDir,
      encoding: "utf-8",
      timeout: 150_000,
      maxBuffer: 16 * 1024 * 1024,
      env,
    });

    // Strip ANSI escapes — CI runners may colorize child output (FORCE_COLOR /
    // runner env), and escape codes between "Tests" and the count break the
    // summary regex below (observed on GH Actions ubuntu-latest).
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(
      /\x1B\[[0-9;]*[a-zA-Z]/g,
      "",
    );
    const tail = output.slice(-4000);
    expect(
      result.error,
      `status=${result.status} signal=${result.signal} error=${result.error} tail=${tail}`,
    ).toBeUndefined();
    // Exit code 0 = the chat suite completed with zero failures.
    expect(result.status, tail).toBe(0);

    // The suite must actually have run tests (not silently matched nothing).
    // Fallback matches "Test Files" in case the child reports only files.
    const passed =
      output.match(/Tests\s+([\d,]+)\s+passed/) ??
      output.match(/Test Files\s+([\d,]+)\s+passed/);
    expect(passed, tail).not.toBeNull();
    expect(Number(passed![1].replace(/,/g, ""))).toBeGreaterThan(0);
  }, 180_000);
});
