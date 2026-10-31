/**
 * EditProviderModal unit tests.
 * STC: UT-21..UT-30 — EditProviderModal form, validation, actions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateForm } from "../edit-provider-validation.ts";
import type { EditProviderFormData } from "../edit-provider-modal.ts";

describe("EditProviderValidation", () => {
  it("UT-21: validates required provider", () => {
    const result = validateForm("", "sk-test", "claude-3-sonnet", "");
    expect(result.valid).toBe(false);
    expect(result.errors.provider).toBe("Please select a provider");
  });

  it("UT-22: validates API key for cloud providers", () => {
    const result = validateForm("anthropic", "", "claude-3-sonnet", "");
    expect(result.valid).toBe(false);
    expect(result.errors.apiKey).toBe("API key is required for this provider");
  });

  it("UT-23: allows empty API key for local providers", () => {
    const result = validateForm("ollama", "", "llama3", "");
    expect(result.valid).toBe(true);
  });

  it("UT-24: allows empty API key for lmstudio", () => {
    const result = validateForm("lmstudio", "", "qwen2", "");
    expect(result.valid).toBe(true);
  });

  it("UT-25: validates required model", () => {
    const result = validateForm("anthropic", "sk-test", "", "");
    expect(result.valid).toBe(false);
    expect(result.errors.model).toBe("Model ID is required");
  });

  it("UT-26: validates base URL format", () => {
    const result = validateForm("anthropic", "sk-test", "claude-3-sonnet", "not-a-url");
    expect(result.valid).toBe(false);
    expect(result.errors.baseUrl).toBe("Invalid URL format");
  });

  it("UT-27: accepts valid base URL", () => {
    const result = validateForm("anthropic", "sk-test", "claude-3-sonnet", "https://api.anthropic.com");
    expect(result.valid).toBe(true);
  });

  it("UT-28: accepts empty base URL", () => {
    const result = validateForm("anthropic", "sk-test", "claude-3-sonnet", "");
    expect(result.valid).toBe(true);
  });

  it("UT-29: does not validate anthropic API key format (format validation not implemented)", () => {
    const result = validateForm("anthropic", "invalid-key", "claude-3-sonnet", "");
    expect(result.valid).toBe(true); // No format validation implemented
  });

  it("UT-30: accepts valid anthropic API key", () => {
    const result = validateForm("anthropic", "sk-ant-validkey123", "claude-3-sonnet", "");
    expect(result.valid).toBe(true);
  });

  it("UT-31: does not validate openai API key format (format validation not implemented)", () => {
    const result = validateForm("openai", "invalid-key", "gpt-4o", "");
    expect(result.valid).toBe(true); // No format validation implemented
  });

  it("UT-32: accepts valid openai API key", () => {
    const result = validateForm("openai", "sk-validkey123", "gpt-4o", "");
    expect(result.valid).toBe(true);
  });

  it("UT-33: does not validate openrouter API key format (format validation not implemented)", () => {
    const result = validateForm("openrouter", "invalid-key", "model", "");
    expect(result.valid).toBe(true); // No format validation implemented
  });
});

describe("EditProviderModal", () => {
  let modal: any;
  let saveSpy: ReturnType<typeof vi.fn>;
  let cancelSpy: ReturnType<typeof vi.fn>;
  let testSpy: ReturnType<typeof vi.fn>;
  let providerChangeSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // NOTE: Do NOT pre-populate document.body with a copy of the modal markup.
    // EditProviderModal builds its own DOM in the constructor (createModal()).
    // A duplicate-ID fixture breaks jsdom/nwsapi scoped ID queries (#modal-provider-select
    // resolves against the document-level ID cache and returns null for the modal's own node).
    saveSpy = vi.fn().mockResolvedValue(undefined);
    cancelSpy = vi.fn();
    testSpy = vi.fn().mockResolvedValue(undefined);
    providerChangeSpy = vi.fn();

    // Import and create modal
    const { EditProviderModal } = await import("../edit-provider-modal.js");
    modal = new EditProviderModal({
      onSave: saveSpy,
      onCancel: cancelSpy,
      onTestConnection: testSpy,
      onProviderChange: providerChangeSpy,
    });
  });

  afterEach(() => {
    modal?.destroy();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("UT-34: shows modal for add", () => {
    modal.showForAdd();
    const overlay = document.querySelector(".modal-overlay");
    expect(overlay?.classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#modal-title")?.textContent).toBe("Add Provider");
  });

  it("UT-35: shows modal for edit with pre-filled data", () => {
    const formData: EditProviderFormData = {
      providerId: "anthropic",
      apiKey: "sk-ant-test123",
      baseUrl: "https://api.anthropic.com",
      model: "claude-3-sonnet",
    };
    modal.showForEdit("anthropic", formData);
    const overlay = document.querySelector(".modal-overlay");
    expect(overlay?.classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#modal-title")?.textContent).toBe("Edit Provider");
    expect((document.querySelector("#modal-provider-select") as HTMLSelectElement).value).toBe("anthropic");
    expect((document.querySelector("#modal-model") as HTMLInputElement).value).toBe("claude-3-sonnet");
  });

  it("UT-36: hides modal on cancel", () => {
    modal.showForAdd();
    // User flow: clicking the Cancel button hides the modal and fires onCancel.
    const cancelBtn = document.querySelector("#modal-cancel-btn") as HTMLButtonElement;
    cancelBtn.click();
    const overlay = document.querySelector(".modal-overlay");
    expect(overlay?.classList.contains("hidden")).toBe(true);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it("UT-37: toggles API key visibility", () => {
    modal.showForAdd();
    const input = document.querySelector("#modal-api-key") as HTMLInputElement;
    const toggleBtn = document.querySelector(".toggle-visibility") as HTMLButtonElement;
    expect(input.type).toBe("password");
    toggleBtn.click();
    expect(input.type).toBe("text");
    expect(toggleBtn.textContent).toBe("🙈");
    toggleBtn.click();
    expect(input.type).toBe("password");
    expect(toggleBtn.textContent).toBe("👁️");
  });

  it("UT-38: validates form on input", () => {
    modal.showForAdd();
    const providerSelect = document.querySelector("#modal-provider-select") as HTMLSelectElement;
    providerSelect.value = "anthropic";
    providerSelect.dispatchEvent(new Event("change"));
    // Wait for validation
    return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
      expect(providerChangeSpy).toHaveBeenCalledWith("anthropic");
    });
  });

  it("UT-39: enables save button when form valid", async () => {
    modal.showForAdd();
    const providerSelect = document.querySelector("#modal-provider-select") as HTMLSelectElement;
    const apiKeyInput = document.querySelector("#modal-api-key") as HTMLInputElement;
    const modelInput = document.querySelector("#modal-model") as HTMLInputElement;

    providerSelect.value = "anthropic";
    providerSelect.dispatchEvent(new Event("change"));
    await new Promise(resolve => setTimeout(resolve, 10));

    apiKeyInput.value = "sk-ant-test123";
    apiKeyInput.dispatchEvent(new Event("input"));
    await new Promise(resolve => setTimeout(resolve, 10));

    modelInput.value = "claude-3-sonnet";
    modelInput.dispatchEvent(new Event("input"));
    await new Promise(resolve => setTimeout(resolve, 10));

    const saveBtn = document.querySelector("#modal-save-btn") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it("UT-40: calls onSave with form data", async () => {
    modal.showForAdd();
    const providerSelect = document.querySelector("#modal-provider-select") as HTMLSelectElement;
    const apiKeyInput = document.querySelector("#modal-api-key") as HTMLInputElement;
    const modelInput = document.querySelector("#modal-model") as HTMLInputElement;

    providerSelect.value = "anthropic";
    providerSelect.dispatchEvent(new Event("change"));
    await new Promise(resolve => setTimeout(resolve, 10));

    apiKeyInput.value = "sk-ant-test123";
    apiKeyInput.dispatchEvent(new Event("input"));
    await new Promise(resolve => setTimeout(resolve, 10));

    modelInput.value = "claude-3-sonnet";
    modelInput.dispatchEvent(new Event("input"));
    await new Promise(resolve => setTimeout(resolve, 10));

    const form = document.querySelector("#edit-provider-form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit"));

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(saveSpy).toHaveBeenCalledWith({
      providerId: "anthropic",
      apiKey: "sk-ant-test123",
      // Selecting a provider auto-fills the default base URL (updateProviderDefaults).
      baseUrl: "https://api.anthropic.com",
      model: "claude-3-sonnet",
    });
  });

  it("UT-41: calls onTestConnection when test button clicked", async () => {
    modal.showForAdd();
    const providerSelect = document.querySelector("#modal-provider-select") as HTMLSelectElement;
    providerSelect.value = "anthropic";
    providerSelect.dispatchEvent(new Event("change"));
    await new Promise(resolve => setTimeout(resolve, 10));

    const testBtn = document.querySelector("#modal-test-btn") as HTMLButtonElement;
    testBtn.click();

    await new Promise(resolve => setTimeout(resolve, 10));
    // Selecting a provider auto-fills the default base URL (updateProviderDefaults),
    // so the connection test is issued against that default URL.
    expect(testSpy).toHaveBeenCalledWith("anthropic", "https://api.anthropic.com");
  });

  it("UT-42: destroys modal cleanly", () => {
    modal.showForAdd();
    modal.destroy();
    expect(document.querySelector(".modal-overlay")).toBeNull();
  });
});