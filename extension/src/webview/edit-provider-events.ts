/**
 * EditProviderEvents — event binding for edit provider modal.
 * Extracted from EditProviderModal for SRP and line limits.
 */

import { FormElements } from "./edit-provider-form.js";
import { EditProviderModalCallbacks } from "./edit-provider-modal.js";
import { PROVIDER_DEFAULTS } from "./edit-provider-form.js";

export interface EventHandlers {
  onProviderChange: (providerId: string) => void;
  onValidateForm: () => void;
  onToggleVisibility: () => void;
  onTestConnection: () => Promise<void>;
  onCancel: () => void;
  onSave: () => Promise<void>;
  onOverlayClick: (e: MouseEvent) => void;
  onEscapeKey: (e: KeyboardEvent) => void;
}

/** Bind all form events. */
export function bindFormEvents(
  modalEl: HTMLElement,
  el: FormElements,
  callbacks: EditProviderModalCallbacks,
  handlers: EventHandlers
): void {
  // Provider selection change
  el.providerSelect.addEventListener("change", () => {
    const providerId = el.providerSelect.value;
    handlers.onProviderChange(providerId);
    callbacks.onProviderChange(providerId);
    handlers.onValidateForm();
  });

  // API key input
  el.apiKeyInput.addEventListener("input", handlers.onValidateForm);

  // Use default URL checkbox
  el.useDefaultUrlChk.addEventListener("change", () => {
    if (el.useDefaultUrlChk.checked) {
      el.baseUrlInput.disabled = true;
      const providerId = el.providerSelect.value;
      const defaults = PROVIDER_DEFAULTS[providerId];
      el.baseUrlInput.value = defaults?.baseUrl || "";
    } else {
      el.baseUrlInput.disabled = false;
      el.baseUrlInput.value = "";
      el.baseUrlInput.focus();
    }
    handlers.onValidateForm();
  });

  // Base URL input
  el.baseUrlInput.addEventListener("input", handlers.onValidateForm);

  // Model input
  el.modelInput.addEventListener("input", handlers.onValidateForm);

  // Toggle API key visibility
  el.toggleVisibilityBtn.addEventListener("click", handlers.onToggleVisibility);

  // Test connection button
  el.testBtn.addEventListener("click", handlers.onTestConnection);

  // Cancel button
  el.cancelBtn.addEventListener("click", handlers.onCancel);

  // Close button
  el.closeBtn.addEventListener("click", handlers.onCancel);

  // Form submit (Save)
  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await handlers.onSave();
  });

  // Close on overlay click
  modalEl.addEventListener("click", handlers.onOverlayClick);

  // Escape key to close
  document.addEventListener("keydown", handlers.onEscapeKey);
}