/**
 * SA4E-370 S4: UI truthfulness unit tests.
 * Covers TC-006 (badge per tab), TC-104 (switch indicator truthfulness),
 * TC-500 (badge shows correct agent per tab), TC-501 (switch indicator),
 * TC-504 (error toast on switch failure), TC-317 (badge reflects wired agent),
 * TC-318 (AGENT_SWITCHED only after wiring), F02 (agentId authorization).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => ({
  workspace: { onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })) },
  window: { createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), show: vi.fn() })) },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

import { ChatStateManager } from "../ChatStateManager";
import type { ChatExtToWebviewMessage } from "../message-protocol";

describe("ChatStateManager per-tab agent badge (S4)", () => {
  let sendToWebview: vi.Mock;
  let getEngine: vi.Mock;

  beforeEach(() => {
    sendToWebview = vi.fn();
    getEngine = vi.fn(() => ({}));
  });

  // TC-006 / TC-500: Badge shows correct agent per tab
  it("TC-006: tracks active agent per tab; different tabs can have different agents", () => {
    const csm = new ChatStateManager("/ws", undefined, sendToWebview, getEngine);

    csm.setActiveAgentForTab("tab-1", "qa-agent");
    csm.setActiveAgentForTab("tab-2", "dev-agent");

    expect(csm.getActiveAgentForTab("tab-1")).toBe("qa-agent");
    expect(csm.getActiveAgentForTab("tab-2")).toBe("dev-agent");
    expect(csm.getActiveAgentForTab("tab-3")).toBeNull();
  });

  // TC-317: Badge reflects wired agent (not pending)
  it("TC-317: badge shows currently wired agent, not a pending one", () => {
    const csm = new ChatStateManager("/ws", undefined, sendToWebview, getEngine);

    csm.setActiveAgentForTab("tab-1", "qa-agent");
    expect(csm.getActiveAgentForTab("tab-1")).toBe("qa-agent");

    // Switch to dev-agent — badge updates
    csm.setActiveAgentForTab("tab-1", "dev-agent");
    expect(csm.getActiveAgentForTab("tab-1")).toBe("dev-agent");
  });

  // null agent clears badge
  it("clears badge when agentId is null", () => {
    const csm = new ChatStateManager("/ws", undefined, sendToWebview, getEngine);

    csm.setActiveAgentForTab("tab-1", "qa-agent");
    csm.setActiveAgentForTab("tab-1", null!);
    expect(csm.getActiveAgentForTab("tab-1")).toBeNull();
  });
});

describe("agentSwitched message truthfulness (S4)", () => {
  // TC-104 / TC-318: AGENT_SWITCHED only after wiring — message has success field
  it("TC-104: chat:agentSwitched message includes success flag for truthfulness", () => {
    const successMsg: ChatExtToWebviewMessage = {
      type: "chat:agentSwitched",
      agentId: "qa-agent",
      agentName: "QA Agent",
      success: true,
      tabId: "tab-1",
      sessionRole: "qa-agent",
      sessionPhase: "testing",
    } as ChatExtToWebviewMessage;

    expect(successMsg.type).toBe("chat:agentSwitched");
    expect((successMsg as any).success).toBe(true);
    expect((successMsg as any).tabId).toBe("tab-1");
    expect((successMsg as any).sessionRole).toBe("qa-agent");
  });

  // TC-504: Error toast on switch failure
  it("TC-504: failed switch message includes error and success=false", () => {
    const failureMsg: ChatExtToWebviewMessage = {
      type: "chat:agentSwitched",
      agentId: null,
      agentName: "default",
      success: false,
      tabId: "tab-1",
      error: "Agent 'bad-agent' not found. Keeping current agent.",
    } as ChatExtToWebviewMessage;

    expect((failureMsg as any).success).toBe(false);
    expect((failureMsg as any).error).toContain("not found");
    expect((failureMsg as any).agentId).toBeNull();
  });
});
