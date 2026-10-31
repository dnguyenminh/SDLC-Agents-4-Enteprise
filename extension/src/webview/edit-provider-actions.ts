/**
 * EditProviderActions — action handlers for edit provider modal.
 * Extracted from EditProviderModal for SRP and line limits.
 */

import { FormElements } from "./edit-provider-form.js";
import { EditProviderModalCallbacks } from "./edit-provider-modal.js";
import { collectFormData, getTestBaseUrl } from "./edit-provider-form.js";
import { validateForm, ValidationResult } from "./edit-provider-validation.js";

const LOCAL_PROVIDERS = ["lmstudio", "ollama", "onnx"];

export interface ActionCallbacks {
  showStatus: (message: string, type: "success" | "error" | "info") => void;
  getModalElement: () => HTMLElement | null;
  getFormElements: () => FormElements | null;
  getTestInProgress: () => boolean;
  setTestInProgress: (value: boolean) => void;
  getIsEditing: () => boolean;
  getCurrentProviderId: () => string | null;
  hide: () => void;
  clearStatus: () => void;
}

/** Handle Test Connection button click. */
export async function handleTestConnection(
  callbacks: EditProviderModalCallbacks,
  actionCallbacks: ActionCallbacks
): Promise<void> {
  const el = actionCallbacks.getFormElements();
  const modalEl = actionCallbacks.getModalElement();
  if (!el || actionCallbacks.getTestInProgress()) { return; }

  const providerId = el.providerSelect.value;
  const baseUrl = getTestBaseUrl(el);
  const testBtn = el.testBtn;
  const statusEl = modalEl?.querySelector("#modal-status") as HTMLElement;

  if (!providerId) {
    actionCallbacks.showStatus("Please select a provider first", "error");
    return;
  }

  actionCallbacks.setTestInProgress(true);
  testBtn.disabled = true;
  testBtn.classList.add("loading");
  actionCallbacks.showStatus("Testing connection...", "info");

  try {
    await callbacks.onTestConnection(providerId, baseUrl);
    actionCallbacks.showStatus("✅ Connection successful!", "success");
  } catch (err: any) {
    actionCallbacks.showStatus(`❌ ${err.message || "Connection failed"}`, "error");
  } finally {
    actionCallbacks.setTestInProgress(false);
    testBtn.disabled = false;
    testBtn.classList.remove("loading");
  }
}

/** Handle Save button click. */
export async function handleSave(
  callbacks: EditProviderModalCallbacks,
  actionCallbacks: ActionCallbacks
): Promise<void> {
  const el = actionCallbacks.getFormElements();
  if (!el) { return; }

  const formData = collectFormData(el);
  const saveBtn = el.saveBtn;

  if (!formData.providerId || (!LOCAL_PROVIDERS.includes(formData.providerId) && !formData.apiKey) || !formData.model) {
    const validation = validateForm(formData.providerId, formData.apiKey, formData.model, formData.baseUrl);
    applyValidationToForm(el, validation);
    return;
  }

  saveBtn.disabled = true;
  saveBtn.classList.add("loading");

  try {
    await callbacks.onSave(formData);
    actionCallbacks.hide();
  } catch (err: any) {
    actionCallbacks.showStatus(`❌ ${err.message || "Save failed"}`, "error");
    saveBtn.disabled = false;
    saveBtn.classList.remove("loading");
  }
}

/** Apply validation results to form UI. */
export function applyValidationToForm(el: FormElements, validation: ValidationResult): void {
  const isLocal = LOCAL_PROVIDERS.includes(el.providerSelect.value);
  el.saveBtn.disabled = !validation.valid;

  const errorMap: Record<string, string> = {
    provider: "provider-error",
    apiKey: "api-key-error",
    model: "model-error",
    baseUrl: "base-url-error",
  };

  for (const [field, elementId] of Object.entries(errorMap)) {
    const show = !!validation.errors[field];
    const message = validation.errors[field] || "";
    const errorEl = el.form.querySelector(`#${elementId}`) as HTMLElement;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = !show;
    }
  }
}