/**
 * EditProviderTemplate — HTML template for edit provider modal.
 * Extracted from EditProviderModal for SRP and line limits.
 */

export const PROVIDER_OPTIONS = [
  { id: "anthropic", label: "Anthropic (Claude)", category: "cloud" },
  { id: "openai", label: "OpenAI (GPT)", category: "cloud" },
  { id: "lmstudio", label: "LM Studio (Local)", category: "local" },
  { id: "openrouter", label: "OpenRouter (Gateway)", category: "gateway" },
  { id: "ollama", label: "Ollama (Local)", category: "local" },
];

/** Get the modal HTML template. */
export function getModalHtml(): string {
  const providerOptionsHtml = PROVIDER_OPTIONS
    .map((p) => `<option value="${p.id}">${p.label}</option>`)
    .join("");

  return `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h3 id="modal-title">Add Provider</h3>
        <button class="modal-close" aria-label="Close modal">&times;</button>
      </div>
      <form class="modal-form" id="edit-provider-form">
        <div class="form-group">
          <label for="modal-provider-select">Provider <span class="required">*</span></label>
          <select id="modal-provider-select" required>
            <option value="">— Select provider —</option>
            ${providerOptionsHtml}
          </select>
          <div class="field-error" id="provider-error" hidden></div>
        </div>

        <div class="form-group" id="api-key-group">
          <label for="modal-api-key">API Key <span class="required" id="api-key-required">*</span></label>
          <div class="input-with-toggle">
            <input type="password" id="modal-api-key" placeholder="Enter API key..." autocomplete="off">
            <button type="button" class="icon-btn toggle-visibility" aria-label="Toggle API key visibility">👁️</button>
          </div>
          <div class="field-hint" id="api-key-hint"></div>
          <div class="field-error" id="api-key-error" hidden></div>
        </div>

        <div class="form-group">
          <label for="modal-base-url">Base URL <span style="opacity:0.6">(optional)</span></label>
          <div class="checkbox-group">
            <label>
              <input type="checkbox" id="modal-use-default-url" checked>
              Use default URL for this provider
            </label>
          </div>
          <input type="text" id="modal-base-url" placeholder="Leave empty for official API" disabled>
          <div class="field-error" id="base-url-error" hidden></div>
        </div>

        <div class="form-group">
          <label for="modal-model">Model <span class="required">*</span></label>
          <input type="text" id="modal-model" placeholder="Enter model ID" required autocomplete="off">
          <div class="field-error" id="model-error" hidden></div>
        </div>

        <div class="modal-btn-row">
          <button type="button" class="btn secondary" id="modal-test-btn">Test Connection</button>
          <button type="button" class="btn danger-outline" id="modal-cancel-btn">Cancel</button>
          <button type="submit" class="btn primary" id="modal-save-btn" disabled>Save</button>
        </div>
      </form>
      <div class="modal-status" id="modal-status" hidden></div>
    </div>
  `;
}

/** Update modal title. */
export function updateModalTitle(modalEl: HTMLElement | null, title: string): void {
  if (!modalEl) { return; }
  const titleEl = modalEl.querySelector("#modal-title");
  if (titleEl) { titleEl.textContent = title; }
}

/** Show the modal. */
export function showModal(modalEl: HTMLElement | null, providerSelect: HTMLSelectElement | null): void {
  modalEl?.classList.remove("hidden");
  setTimeout(() => { providerSelect?.focus(); }, 50);
}

/** Hide the modal. */
export function hideModal(modalEl: HTMLElement | null): void {
  modalEl?.classList.add("hidden");
}

/** Check if modal is visible. */
export function isModalVisible(modalEl: HTMLElement | null): boolean {
  return !modalEl?.classList.contains("hidden") ?? false;
}

/** Destroy the modal. */
export function destroyModal(modalEl: HTMLElement | null): void {
  modalEl?.remove();
}

/** Clear status message. */
export function clearModalStatus(modalEl: HTMLElement | null): void {
  if (!modalEl) { return; }
  const statusEl = modalEl.querySelector("#modal-status") as HTMLElement;
  statusEl.textContent = "";
  statusEl.className = "modal-status";
  statusEl.hidden = true;
}

/** Show status message in modal. */
export function showModalStatus(modalEl: HTMLElement | null, message: string, type: "success" | "error" | "info"): void {
  if (!modalEl) { return; }
  const statusEl = modalEl.querySelector("#modal-status") as HTMLElement;
  statusEl.textContent = message;
  statusEl.className = `modal-status ${type}`;
  statusEl.hidden = false;
}