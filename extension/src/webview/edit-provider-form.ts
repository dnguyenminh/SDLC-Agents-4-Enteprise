/**
 * EditProviderForm — form state and logic for edit provider modal.
 * Extracted from EditProviderModal for SRP and line limits.
 */

import { EditProviderFormData } from "./edit-provider-modal.js";

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-3-sonnet" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  lmstudio: { baseUrl: "http://localhost:1234/v1", model: "qwen2-7b-instruct" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openrouter-mixtral" },
  ollama: { baseUrl: "http://localhost:11434", model: "llama3" },
};

const LOCAL_PROVIDERS = ["lmstudio", "ollama", "onnx"];

export interface FormElements {
  form: HTMLFormElement;
  providerSelect: HTMLSelectElement;
  apiKeyInput: HTMLInputElement;
  useDefaultUrlChk: HTMLInputElement;
  baseUrlInput: HTMLInputElement;
  modelInput: HTMLInputElement;
  testBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  toggleVisibilityBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
  apiKeyGroup: HTMLElement;
  apiKeyRequired: HTMLElement;
  apiKeyHint: HTMLElement;
}

/** Initialize form elements from modal element. */
export function initFormElements(modalEl: HTMLElement): FormElements {
  return {
    form: modalEl.querySelector("#edit-provider-form") as HTMLFormElement,
    providerSelect: modalEl.querySelector("#modal-provider-select") as HTMLSelectElement,
    apiKeyInput: modalEl.querySelector("#modal-api-key") as HTMLInputElement,
    useDefaultUrlChk: modalEl.querySelector("#modal-use-default-url") as HTMLInputElement,
    baseUrlInput: modalEl.querySelector("#modal-base-url") as HTMLInputElement,
    modelInput: modalEl.querySelector("#modal-model") as HTMLInputElement,
    testBtn: modalEl.querySelector("#modal-test-btn") as HTMLButtonElement,
    cancelBtn: modalEl.querySelector("#modal-cancel-btn") as HTMLButtonElement,
    saveBtn: modalEl.querySelector("#modal-save-btn") as HTMLButtonElement,
    toggleVisibilityBtn: modalEl.querySelector(".toggle-visibility") as HTMLButtonElement,
    closeBtn: modalEl.querySelector(".modal-close") as HTMLButtonElement,
    apiKeyGroup: modalEl.querySelector("#api-key-group") as HTMLElement,
    apiKeyRequired: modalEl.querySelector("#api-key-required") as HTMLElement,
    apiKeyHint: modalEl.querySelector("#api-key-hint") as HTMLElement,
  };
}

/** Reset form to defaults. */
export function resetForm(el: FormElements): void {
  el.form.reset();
  el.providerSelect.value = "";
  el.useDefaultUrlChk.checked = true;
  el.baseUrlInput.disabled = true;
  el.baseUrlInput.value = "";
  el.apiKeyInput.type = "password";
  el.toggleVisibilityBtn.textContent = "👁️";
  updateProviderDefaults(el, "");
}

/** Populate form with existing provider data. */
export function populateForm(el: FormElements, formData: Partial<EditProviderFormData>): void {
  el.providerSelect.value = formData.providerId || "";
  el.modelInput.value = formData.model || "";

  // API key - show masked
  if (formData.apiKey) {
    el.apiKeyInput.value = "●".repeat(20);
    el.apiKeyInput.dataset.hasKey = "true";
  } else {
    el.apiKeyInput.value = "";
    el.apiKeyInput.dataset.hasKey = "false";
  }

  // Base URL
  if (formData.baseUrl) {
    el.useDefaultUrlChk.checked = false;
    el.baseUrlInput.disabled = false;
    el.baseUrlInput.value = formData.baseUrl;
  } else {
    el.useDefaultUrlChk.checked = true;
    el.baseUrlInput.disabled = true;
    const defaults = PROVIDER_DEFAULTS[formData.providerId || ""];
    el.baseUrlInput.value = defaults?.baseUrl || "";
  }

  updateProviderDefaults(el, formData.providerId || "");
}

/** Update defaults and field visibility based on provider. */
export function updateProviderDefaults(el: FormElements, providerId: string): void {
  const isLocal = LOCAL_PROVIDERS.includes(providerId);
  const defaults = PROVIDER_DEFAULTS[providerId];

  // Show/hide API key for local providers
  if (isLocal) {
    el.apiKeyGroup.style.display = "none";
    el.apiKeyRequired.textContent = "";
  } else {
    el.apiKeyGroup.style.display = "";
    el.apiKeyRequired.textContent = "*";
  }

  // Update hints
  el.apiKeyHint.textContent = getApiKeyHint(providerId);

  // Update defaults
  if (defaults) {
    if (el.useDefaultUrlChk.checked) {
      el.baseUrlInput.value = defaults.baseUrl;
    }
    if (!el.modelInput.value) {
      el.modelInput.value = defaults.model;
    }
  }
}

/** Get API key hint for a provider. */
function getApiKeyHint(providerId: string): string {
  if (providerId === "lmstudio") {
    return "Optional for LM Studio (local server typically doesn't require auth)";
  }
  if (providerId === "ollama") {
    return "Not required for Ollama (local server)";
  }
  return "";
}

/** Collect form data for submission. */
export function collectFormData(el: FormElements): EditProviderFormData {
  return {
    providerId: el.providerSelect.value,
    apiKey: el.apiKeyInput.value.trim(),
    baseUrl: el.baseUrlInput.value.trim(),
    model: el.modelInput.value.trim(),
  };
}

/** Get base URL for test connection. */
export function getTestBaseUrl(el: FormElements): string | undefined {
  const baseUrl = el.baseUrlInput.value.trim();
  return baseUrl || undefined;
}