/**
 * ProviderTable unit tests.
 * STC: UT-01..UT-10 — ProviderTable rendering and event binding.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderRow, renderEmptyRow, getProviderIcon, escapeHtml } from "../provider-table-row-renderer.ts";
import { bindTableEvents } from "../provider-table-events.ts";
import type { ProviderProfile, ProviderStatus, ProviderTableCallbacks } from "../provider-table-row-renderer.ts";

describe("ProviderTableRowRenderer", () => {
  const mockProfile: ProviderProfile = {
    id: "anthropic-default",
    name: "Anthropic - default",
    provider: "anthropic",
    model: "claude-3-sonnet",
    baseUrl: "https://api.anthropic.com",
    apiKeyMasked: "●●●●●●●●●●●●●●●●●●●●",
    status: "connected",
    lastTestStatus: "connected",
    lastTestAt: Date.now(),
  };

  it("UT-01: renders a provider row with all columns", () => {
    const html = renderRow(mockProfile, 0);
    expect(html).toContain("Anthropic");
    expect(html).toContain("anthropic");
    expect(html).toContain("claude-3-sonnet");
    expect(html).toContain("https://api.anthropic.com");
    expect(html).toContain("●●●●●●●●●●●●●●●●●●●●");
    expect(html).toContain("Connected");
    expect(html).toContain("status-badge connected");
    expect(html).toContain("data-provider-id=\"anthropic\"");
    expect(html).toContain("data-index=\"0\"");
  });

  it("UT-02: renders disconnected status correctly", () => {
    const disconnectedProfile = { ...mockProfile, status: "disconnected" as ProviderStatus, apiKeyMasked: "" };
    const html = renderRow(disconnectedProfile, 0);
    expect(html).toContain("Failed");
    expect(html).toContain("status-badge disconnected");
  });

  it("UT-03: renders unknown status correctly", () => {
    const unknownProfile = { ...mockProfile, status: "unknown" as ProviderStatus };
    const html = renderRow(unknownProfile, 0);
    expect(html).toContain("Untested");
    expect(html).toContain("status-badge unknown");
  });

  it("UT-04: shows default base URL for ollama", () => {
    const ollamaProfile = { ...mockProfile, provider: "ollama", baseUrl: undefined };
    const html = renderRow(ollamaProfile, 0);
    expect(html).toContain("http://localhost:11434");
  });

  it("UT-05: shows 'Use default' for providers without base URL", () => {
    const noUrlProfile = { ...mockProfile, baseUrl: undefined, provider: "openai" };
    const html = renderRow(noUrlProfile, 0);
    expect(html).toContain("Use default");
  });

  it("UT-06: renders empty state when no providers", () => {
    const html = renderEmptyRow();
    expect(html).toContain("No providers configured");
    expect(html).toContain("Click \"+ Add Provider\"");
    expect(html).toContain("empty-row");
  });

  it("UT-07: getProviderIcon returns correct icons", () => {
    expect(getProviderIcon("anthropic")).toBe("🤖");
    expect(getProviderIcon("openai")).toBe("🧠");
    expect(getProviderIcon("lmstudio")).toBe("💻");
    expect(getProviderIcon("openrouter")).toBe("🔀");
    expect(getProviderIcon("ollama")).toBe("🦙");
    expect(getProviderIcon("onnx")).toBe("⚙️");
    expect(getProviderIcon("unknown")).toBe("📦");
  });

  it("UT-08: escapeHtml prevents XSS", () => {
    const malicious = "<script>alert('xss')</script>";
    const escaped = escapeHtml(malicious);
    // Escaped version should NOT contain raw HTML tags
    expect(escaped).not.toContain("<script>");
    expect(escaped).not.toContain("</script>");
    // Should be different from input (proves escaping happened)
    expect(escaped).not.toBe(malicious);
    // Should contain escaped entity strings
    expect(escaped).toContain("&lt;"); // < escaped to <
    expect(escaped).toContain("&gt;"); // > escaped to >
    expect(escaped).toContain("&#39;"); // ' escaped to '
  });

  it("UT-09: escapeHtml handles quotes", () => {
    const withQuotes = "He said \"hello\" & 'goodbye'";
    const escaped = escapeHtml(withQuotes);
    expect(escaped).toContain("&#34;"); // " escaped to &#34;
    expect(escaped).toContain("&#39;"); // ' escaped to '
    expect(escaped).toContain("&amp;"); // & escaped to &
  });

  it("UT-10: renders action buttons with correct data attributes", () => {
    const html = renderRow(mockProfile, 0);
    expect(html).toContain('data-action="edit"');
    expect(html).toContain('data-action="test"');
    expect(html).toContain('data-action="delete"');
    expect(html).toContain('class="icon-btn edit-btn"');
    expect(html).toContain('class="icon-btn test-btn"');
    expect(html).toContain('class="icon-btn delete-btn"');
  });
});

describe("ProviderTableEvents", () => {
  let container: HTMLElement;
  let callbacks: ProviderTableCallbacks;
  let editSpy: ReturnType<typeof vi.fn>;
  let testSpy: ReturnType<typeof vi.fn>;
  let deleteSpy: ReturnType<typeof vi.fn>;
  let addSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    editSpy = vi.fn();
    testSpy = vi.fn();
    deleteSpy = vi.fn();
    addSpy = vi.fn();

    callbacks = {
      onEdit: editSpy,
      onTest: testSpy,
      onDelete: deleteSpy,
      onAdd: addSpy,
    };

    // Mock profile row
    container.innerHTML = `
      <div class="provider-table-wrapper">
        <div class="table-toolbar">
          <button class="btn primary" id="add-provider-btn">+ Add Provider</button>
        </div>
        <div class="table-container">
          <table class="provider-table">
            <tbody>
              <tr data-provider-id="anthropic">
                <td class="provider-actions">
                  <button class="icon-btn edit-btn" data-action="edit">✏️</button>
                  <button class="icon-btn test-btn" data-action="test">🔄</button>
                  <button class="icon-btn delete-btn" data-action="delete">🗑️</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  afterEach(() => {
    container.remove();
  });

  it("UT-11: binds add provider button", () => {
    bindTableEvents(container, callbacks);
    const addBtn = container.querySelector("#add-provider-btn");
    addBtn?.click();
    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it("UT-12: binds edit button with provider ID", () => {
    bindTableEvents(container, callbacks);
    const editBtn = container.querySelector(".edit-btn");
    editBtn?.click();
    expect(editSpy).toHaveBeenCalledWith("anthropic");
  });

  it("UT-13: binds test button with provider ID", () => {
    bindTableEvents(container, callbacks);
    const testBtn = container.querySelector(".test-btn");
    testBtn?.click();
    expect(testSpy).toHaveBeenCalledWith("anthropic");
  });

  it("UT-14: binds delete button with provider ID", () => {
    bindTableEvents(container, callbacks);
    const deleteBtn = container.querySelector(".delete-btn");
    deleteBtn?.click();
    expect(deleteSpy).toHaveBeenCalledWith("anthropic");
  });

  it("UT-15: ignores clicks on non-action elements", () => {
    bindTableEvents(container, callbacks);
    const td = container.querySelector("td");
    td?.click();
    expect(editSpy).not.toHaveBeenCalled();
    expect(testSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("UT-16: handles missing provider ID gracefully", () => {
    bindTableEvents(container, callbacks);
    // Remove data-provider-id from row
    const row = container.querySelector("tr");
    row?.removeAttribute("data-provider-id");
    const editBtn = container.querySelector(".edit-btn");
    editBtn?.click();
    expect(editSpy).not.toHaveBeenCalled();
  });
});