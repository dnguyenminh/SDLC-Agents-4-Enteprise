import { vi, describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
import { ChatPanelProvider } from "../chat-panel-provider";
import { normalizeUsageToFraction, SessionMonitor } from "../../pi-agent/session-compactor";
import { formatSummaryMessage } from "../../pi-agent/summarizer";
import { ContextUsageTracker } from "../context-usage-tracker";

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
    webviewMessages = [];
    mockEngine = {
      getDetectedContextWindow: vi.fn().mockReturnValue(128000),
      getChatHistory: vi.fn().mockReturnValue([]),
      setChatHistory: vi.fn(),
      listAvailableTools: vi.fn().mockResolvedValue([])
    };

    const mockUri = { fsPath: "/mock/path" } as any;
    const mockMcpManager = { onStatusChange: vi.fn() } as any;

    provider = new ChatPanelProvider(mockUri, mockMcpManager, "/mock/ws");
    
    // Inject mock engine
    provider.engine = mockEngine;

    // Spy on sendToWebview
    vi.spyOn(provider, "sendToWebview").mockImplementation((msg: any) => {
      webviewMessages.push(msg);
    });

    // Mock the contextUsageTracker to return specific usage
    const mockTracker = {
      setMaxTokens: vi.fn(),
      updateFromMessages: vi.fn(),
      updateSteeringTokens: vi.fn(),
      addToolTokens: vi.fn(),
      getUsagePayload: vi.fn().mockReturnValue({
        total: { tokens: 1000, percentage: 10 },
        maxTokens: 128000,
        conversation: { tokens: 1000, percentage: 10 },
        mcpTools: { tokens: 0, percentage: 0 },
        steering: { tokens: 0, percentage: 0 },
      })
    };
    provider.contextUsageTracker = mockTracker;
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

    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const tail = output.slice(-4000);
    expect(result.error, String(result.error ?? "")).toBeUndefined();
    // Exit code 0 = the chat suite completed with zero failures.
    expect(result.status, tail).toBe(0);

    // The suite must actually have run tests (not silently matched nothing).
    const passed = output.match(/Tests\s+([\d,]+)\s+passed/);
    expect(passed, tail).not.toBeNull();
    expect(Number(passed![1].replace(/,/g, ""))).toBeGreaterThan(0);
  }, 180_000);
});
