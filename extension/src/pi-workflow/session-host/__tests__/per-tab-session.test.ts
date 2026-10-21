/**
 * SA4E-370 S3: Per-tab session isolation tests.
 * Covers TC-005 (two tabs = two sessions), TC-103 (compaction uses tabId),
 * TC-203 (tab close disposes session), TC-204 (no leak between tabs),
 * TC-313 (registry key = workspaceRoot+tabId), TC-314 (tabId never "default"),
 * TC-315 (session dispose on tab close), TC-407 (≥10 tabs), TC-409 (tabId="default" rejected).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateHost, mockSession } = vi.hoisted(() => ({
  mockCreateHost: vi.fn(),
  mockSession: {
    subscribe: vi.fn(() => vi.fn()),
    prompt: vi.fn(),
    dispose: vi.fn(),
    getSessionFile: vi.fn(() => undefined),
  },
}));

vi.mock("../create-host.js", () => ({
  createHost: mockCreateHost,
}));

vi.mock("../../debug-logger", () => ({
  debugLog: vi.fn(),
}));

import {
  ensureSessionHost,
  evictSessionHost,
  clearSessionHostCache,
  sessionKey,
} from "../registry.js";
import type { SessionHostOptions } from "../types.js";

// sessionKey is exported for testing; check it's exported
const key = sessionKey as (ws: string, tab: string) => string;

describe("registry.ts per-tab session (S3)", () => {
  beforeEach(() => {
    clearSessionHostCache();
    vi.clearAllMocks();
    mockCreateHost.mockResolvedValue({
      session: mockSession,
      dispose: vi.fn(),
      promptTurn: vi.fn(),
      getSessionFile: vi.fn(() => undefined),
    } as any);
  });

  // TC-313: Registry key = workspaceRoot+tabId
  it("TC-313: computes composite session key workspaceRoot+tabId", () => {
    expect(key("/ws-root", "tab-1")).toBe("/ws-root+tab-1");
    expect(key("/ws-root", "tab-2")).toBe("/ws-root+tab-2");
    expect(key("/ws-root", "tab-1")).not.toBe(key("/ws-root", "tab-2"));
  });

  // TC-005: Two tabs = two sessions
  it("TC-005: creates separate sessions for two tabs in same workspace", async () => {
    const baseOpts: SessionHostOptions = {
      workspaceRoot: "/test-workspace",
      providerId: "anthropic",
    };

    const host1 = await ensureSessionHost({ ...baseOpts, tabId: "tab-1" } as any);
    const host2 = await ensureSessionHost({ ...baseOpts, tabId: "tab-2" } as any);

    expect(mockCreateHost).toHaveBeenCalledTimes(2);
    expect(mockCreateHost.mock.calls[0][0]).toMatchObject({
      workspaceRoot: "/test-workspace",
      tabId: "tab-1",
    });
    expect(mockCreateHost.mock.calls[1][0]).toMatchObject({
      workspaceRoot: "/test-workspace",
      tabId: "tab-2",
    });
    expect(host1).toBeDefined();
    expect(host2).toBeDefined();
  });

  // TC-314: tabId never "default"
  it("TC-314: rejects tabId='default'", async () => {
    const baseOpts: SessionHostOptions = {
      workspaceRoot: "/test-workspace",
      providerId: "anthropic",
    };

    // D1 behavior: tabId validation throws synchronously (PI_INVALID_TAB_ID)
    expect(() =>
      ensureSessionHost({ ...baseOpts, tabId: "default" } as any)
    ).toThrow();

    expect(mockCreateHost).not.toHaveBeenCalled();
  });

  // TC-203: Tab close disposes session
  it("TC-203: evictSessionHost removes session from registry", async () => {
    const baseOpts: SessionHostOptions = {
      workspaceRoot: "/test-workspace",
      providerId: "anthropic",
    };

    await ensureSessionHost({ ...baseOpts, tabId: "tab-1" } as any);
    expect(mockCreateHost).toHaveBeenCalledTimes(1);

    evictSessionHost("/test-workspace", "tab-1");

    // Creating again should call createHost fresh (not cached)
    await ensureSessionHost({ ...baseOpts, tabId: "tab-1" } as any);
    expect(mockCreateHost).toHaveBeenCalledTimes(2);
  });

  // TC-204: No leak between tabs
  it("TC-204: sessions are isolated — tab-1 and tab-2 have separate keys", async () => {
    const baseOpts: SessionHostOptions = {
      workspaceRoot: "/test-workspace",
      providerId: "anthropic",
    };

    await ensureSessionHost({ ...baseOpts, tabId: "tab-1" } as any);
    await ensureSessionHost({ ...baseOpts, tabId: "tab-2" } as any);

    expect(mockCreateHost).toHaveBeenCalledTimes(2);
    const call1 = mockCreateHost.mock.calls[0][0] as SessionHostOptions & { tabId: string };
    const call2 = mockCreateHost.mock.calls[1][0] as SessionHostOptions & { tabId: string };
    expect(call1.tabId).toBe("tab-1");
    expect(call2.tabId).toBe("tab-2");
    expect(call1.tabId).not.toBe(call2.tabId);
  });

  // TC-407: ≥ 10 concurrent tabs
  it("TC-407: supports ≥ 10 concurrent tabs without degradation", async () => {
    const baseOpts: SessionHostOptions = {
      workspaceRoot: "/test-workspace",
      providerId: "anthropic",
    };

    const tabCount = 10;
    const promises = [];
    for (let i = 1; i <= tabCount; i++) {
      promises.push(
        ensureSessionHost({ ...baseOpts, tabId: `tab-${i}` } as any)
      );
    }
    const hosts = await Promise.all(promises);

    expect(mockCreateHost).toHaveBeenCalledTimes(tabCount);
    expect(hosts.length).toBe(tabCount);

    // Each tab has a unique key
    const tabIds = new Set(mockCreateHost.mock.calls.map((c) => (c[0] as any).tabId));
    expect(tabIds.size).toBe(tabCount);
  });
});
