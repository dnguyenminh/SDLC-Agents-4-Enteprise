/**
 * ProviderTableRowRenderer — HTML rendering for provider table rows.
 * Extracted from ProviderTable for SRP and line limits.
 */

import { ProviderProfile, ProviderStatus, EditProviderFormData } from "./provider-table-row-renderer.js";

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-3-sonnet" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  lmstudio: { baseUrl: "http://localhost:1234/v1", model: "qwen2-7b-instruct" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openrouter-mixtral" },
  ollama: { baseUrl: "http://localhost:11434", model: "llama3" },
};

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "🤖",
  openai: "🧠",
  lmstudio: "💻",
  openrouter: "🔀",
  ollama: "🦙",
  onnx: "⚙️",
};

const STATUS_LABELS: Record<ProviderStatus, string> = {
  connected: "Connected",
  disconnected: "Failed",
  unknown: "Untested",
};

const STATUS_CLASSES: Record<ProviderStatus, string> = {
  connected: "status-badge connected",
  disconnected: "status-badge disconnected",
  unknown: "status-badge unknown",
};

export interface FormElements {
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

export function populateForm(el: FormElements, formData: Partial<EditProviderFormData>): void {
  el.providerSelect.value = formData.providerId || "";
  el.modelInput.value = formData.model || "";

  if (formData.apiKey) {
    el.apiKeyInput.value = "●".repeat(20);
    el.apiKeyInput.dataset.hasKey = "true";
  } else {
    el.apiKeyInput.value = "";
    el.apiKeyInput.dataset.hasKey = "false";
  }

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

export function updateProviderDefaults(el: FormElements, providerId: string): void {
  const isLocal = ["lmstudio", "ollama", "onnx"].includes(providerId);
  const defaults = PROVIDER_DEFAULTS[providerId];

  if (isLocal) {
    el.apiKeyGroup.style.display = "none";
    el.apiKeyRequired.textContent = "";
  } else {
    el.apiKeyGroup.style.display = "";
    el.apiKeyRequired.textContent = "*";
  }

  el.apiKeyHint.textContent = getApiKeyHint(providerId);

  if (defaults) {
    if (el.useDefaultUrlChk.checked) {
      el.baseUrlInput.value = defaults.baseUrl;
    }
    if (!el.modelInput.value) {
      el.modelInput.value = defaults.model;
    }
  }
}

function getApiKeyHint(providerId: string): string {
  if (providerId === "lmstudio") {
    return "Optional for LM Studio (local server typically doesn't require auth)";
  }
  if (providerId === "ollama") {
    return "Not required for Ollama (local server)";
  }
  return "";
}

export function collectFormData(el: FormElements): EditProviderFormData {
  return {
    providerId: el.providerSelect.value,
    apiKey: el.apiKeyInput.value.trim(),
    baseUrl: el.baseUrlInput.value.trim(),
    model: el.modelInput.value.trim(),
  };
}

export function getTestBaseUrl(el: FormElements): string | undefined {
  const baseUrl = el.baseUrlInput.value.trim();
  return baseUrl || undefined;
}

export function getProviderIcon(provider: string): string {
  return PROVIDER_ICONS[provider] || "📦";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "\u0026\u0061\u006d\u0070\u003b")
    .replace(/</g, "\u0026\u006c\u0074\u003b")
    .replace(/>/g, "\u0026\u0067\u0074\u003b")
    .replace(/"/g, "\u0026\u0023\u0033\u0034\u003b")
    .replace(/'/g, "\u0026\u0023\u0033\u0039\u003b");
}

export function renderRow(profile: ProviderProfile, index: number): string {
  const icon = getProviderIcon(profile.provider);
  const statusLabel = STATUS_LABELS[profile.status] || "Untested";
  const statusClass = STATUS_CLASSES[profile.status] || "status-badge unknown";
  const baseUrl = profile.baseUrl || (profile.provider === "ollama" ? "http://localhost:11434" : "Use default");
  const apiKeyMasked = profile.apiKeyMasked || "—";

  return `
    <tr data-provider-id="${escapeHtml(profile.provider)}" data-index="${index}">
      <td class="provider-name">
        <span class="provider-icon">${icon}</span>
        <span class="provider-label">${escapeHtml(profile.name)}</span>
      </td>
      <td class="provider-status"><span class="${statusClass}">${statusLabel}</span></td>
      <td class="provider-api-key" title="API Key">${escapeHtml(apiKeyMasked)}</td>
      <td class="provider-base-url" title="${escapeHtml(profile.baseUrl || "")}">${escapeHtml(baseUrl)}</td>
      <td class="provider-model">${escapeHtml(profile.model || "—")}</td>
      <td class="provider-actions">
        <button class="icon-btn edit-btn" data-action="edit" title="Edit provider">✏️</button>
        <button class="icon-btn test-btn" data-action="test" title="Test connection">🔄</button>
        <button class="icon-btn delete-btn" data-action="delete" title="Delete provider">🗑️</button>
      </td>
    </tr>
  `.trim();
}

export function renderEmptyRow(): string {
  return `
    <tr class="empty-row">
      <td colspan="6" class="empty-state">
        <span class="empty-icon">📭</span>
        <p>No providers configured</p>
        <p class="empty-hint">Click "+ Add Provider" to get started</p>
      </td>
    </tr>
  `.trim();
}

export { escapeHtml };