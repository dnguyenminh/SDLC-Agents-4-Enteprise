/**
 * SA4E-319 / SA4E-321 — iframe token delivery contract.
 * Regression test: the credential must never ride on the iframe URL (it lands in
 * the backend access log, proxy logs, browser history and Referer). It is handed
 * to the frame by postMessage once the frame has loaded, which is also what makes
 * the previous `sso_token` URL bootstrap unnecessary.
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

function iframeSrc(html: string): string {
  const match = html.match(/<iframe src="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1];
}

describe("SA4E-321 getIframeHtml token delivery", () => {
  it("never puts the token on the iframe URL", () => {
    const html = getIframeHtml("graph", () => "my-secret-token");
    const src = iframeSrc(html);
    expect(src).not.toContain("sso_token");
    expect(src).not.toContain("my-secret-token");
    expect(src).not.toContain("&token=");
    expect(src).not.toContain("refreshToken");
  });

  it("keeps embed/page/projectId on the iframe URL", () => {
    const src = iframeSrc(getIframeHtml("graph", () => "my-secret-token"));
    expect(src).toContain("embed=true");
    expect(src).toContain("page=graph");
    expect(src).toContain("projectId=proj-123");
  });

  it("delivers the token by postMessage after the frame loads", () => {
    const html = getIframeHtml("graph", () => "my-secret-token");
    expect(html).toContain("iframe.addEventListener('load'");
    expect(html).toContain("type: 'token_refreshed'");
    expect(html).toContain("my-secret-token");
  });

  it("signals auth_unavailable when there is no token", () => {
    const html = getIframeHtml("graph");
    expect(html).toContain("postMessage({ type: 'auth_unavailable' }");
    expect(html).not.toContain("my-secret-token");
  });
});
