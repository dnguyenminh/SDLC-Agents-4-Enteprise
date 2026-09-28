/**
 * SA4E-319 — Regression test for split-brain auth fix.
 * Verifies getIframeHtml() builds the iframe src with the unified `sso_token` key
 * (the key the SPA __ssoBootstrap reads), NOT the legacy `token` key that caused
 * the SPA to render the login screen instead of the panel content.
 */
import { describe, it, expect, vi } from "vitest";

// vscode is unavailable outside the extension host — stub the minimal surface used
// by the panel-html import chain (base-panel + mcp-server-manager).
vi.mock("vscode", () => ({
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  Uri: { joinPath: (..._s: unknown[]) => ({ fsPath: "" }) },
  ViewColumn: { One: 1 },
  window: { createWebviewPanel: vi.fn() },
}));

// Deterministic backend URL, projectId, and nonce so the assertion is stable.
vi.mock("../../config/backend-url", () => ({
  getBackendUrl: () => "http://127.0.0.1:48721",
}));
vi.mock("../../extension", () => ({
  getProjectId: () => "proj-123",
}));
vi.mock("../../mcp-server-manager", () => ({
  getNonce: () => "test-nonce",
}));

import { getIframeHtml } from "../panel-html";

describe("SA4E-319 getIframeHtml token key", () => {
  it("builds iframe src with sso_token key (unified bootstrap key)", () => {
    const html = getIframeHtml("graph", () => "my-token");
    const srcMatch = html.match(/<iframe src="([^"]+)"/);
    expect(srcMatch).not.toBeNull();
    const src = srcMatch![1];
    expect(src).toContain("sso_token=my-token");
  });

  it("does NOT emit the legacy &token= bootstrap key", () => {
    const html = getIframeHtml("graph", () => "my-token");
    const src = html.match(/<iframe src="([^"]+)"/)![1];
    // Guard against regression: the legacy key must not reappear. `&token=` would be
    // read as null by the SPA (which only reads sso_token) → split-brain login screen.
    expect(src).not.toContain("&token=");
  });

  it("url-encodes the token value", () => {
    const html = getIframeHtml("graph", () => "a b+c/d");
    const src = html.match(/<iframe src="([^"]+)"/)![1];
    expect(src).toContain("sso_token=" + encodeURIComponent("a b+c/d"));
  });
});
