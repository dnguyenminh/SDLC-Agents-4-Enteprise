/**
 * Edit Provider Modal — Modal dialog for adding/editing LLM provider configuration.
 * Fields: Provider dropdown, API Key (masked), Base URL, Model, Test Connection, Save.
 * Delegates to specialized modules for form logic, validation, events, actions, and template.
 */

export interface EditProviderFormData {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface EditProviderModalCallbacks {
  onSave: (formData: EditProviderFormData) => Promise<void>;
  onCancel: () => void;
  onTestConnection: (providerId: string, baseUrl?: string) => Promise<void>;
  onProviderChange: (providerId: string) => void;
}

import { initFormElements, resetForm, populateForm, updateProviderDefaults, FormElements } from "./edit-provider-form.js";
import { bindFormEvents } from "./edit-provider-events.js";
import { handleTestConnection, handleSave, applyValidationToForm, ActionCallbacks } from "./edit-provider-actions.js";
import { validateForm } from "./edit-provider-validation.js";
import { getModalHtml, updateModalTitle, showModal, hideModal, isModalVisible, destroyModal, clearModalStatus, showModalStatus } from "./edit-provider-template.js";

/**
 * EditProviderModal — manages the add/edit provider modal dialog.
 * Delegates form logic to EditProviderForm, validation to EditProviderValidation,
 * events to EditProviderEvents, actions to EditProviderActions, and template to EditProviderTemplate.
 */
export class EditProviderModal {
  private modalEl: HTMLElement | null = null;
  private callbacks: EditProviderModalCallbacks;
  private el: FormElements | null = null;
  private currentProviderId: string | null = null;
  private isEditing = false;
  private testInProgress = false;

  constructor(callbacks: EditProviderModalCallbacks) {
    this.callbacks = callbacks;
    this.createModal();
  }

  /** Create the modal DOM structure. */
  private createModal(): void {
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal-overlay hidden";
    this.modalEl.innerHTML = getModalHtml();
    document.body.appendChild(this.modalEl);
    this.el = initFormElements(this.modalEl);
    this.bindEvents();
  }

  /** Bind event listeners using EditProviderEvents. */
  private bindEvents(): void {
    if (!this.modalEl || !this.el) { return; }

    const handlers = {
      onProviderChange: (providerId: string) => this.onProviderChange(providerId),
      onValidateForm: () => this.validateForm(),
      onToggleVisibility: () => this.toggleVisibility(),
      onTestConnection: () => handleTestConnection(this.callbacks, this.getActionCallbacks()),
      onCancel: () => { this.hide(); this.callbacks.onCancel(); },
      onSave: () => handleSave(this.callbacks, this.getActionCallbacks()),
      onOverlayClick: (e: MouseEvent) => { if (e.target === this.modalEl) { this.hide(); this.callbacks.onCancel(); } },
      onEscapeKey: (e: KeyboardEvent) => { if (e.key === "Escape" && this.isVisible()) { this.hide(); this.callbacks.onCancel(); } },
    };

    bindFormEvents(this.modalEl, this.el, this.callbacks, handlers);
  }

  /** Get action callbacks for EditProviderActions. */
  private getActionCallbacks(): ActionCallbacks {
    return {
      showStatus: (message, type) => showModalStatus(this.modalEl, message, type),
      getModalElement: () => this.modalEl,
      getFormElements: () => this.el,
      getTestInProgress: () => this.testInProgress,
      setTestInProgress: (v) => { this.testInProgress = v; },
      getIsEditing: () => this.isEditing,
      getCurrentProviderId: () => this.currentProviderId,
      hide: () => this.hide(),
      clearStatus: () => clearModalStatus(this.modalEl),
    };
  }

  /** Handle provider change — update defaults and field visibility. */
  private onProviderChange(providerId: string): void {
    if (!this.el) { return; }
    updateProviderDefaults(this.el, providerId);
    this.currentProviderId = providerId;
    this.validateForm();
  }

  /** Validate form and enable/disable save button. */
  private validateForm(): void {
    if (!this.el) { return; }

    const providerId = this.el.providerSelect.value;
    const apiKey = this.el.apiKeyInput.value;
    const model = this.el.modelInput.value;
    const baseUrl = this.el.baseUrlInput.value;

    const validation = validateForm(providerId, apiKey, model, baseUrl);
    applyValidationToForm(this.el, validation);
  }

  /** Toggle API key visibility. */
  private toggleVisibility(): void {
    if (!this.el) { return; }
    const isPassword = this.el.apiKeyInput.type === "password";
    this.el.apiKeyInput.type = isPassword ? "text" : "password";
    this.el.toggleVisibilityBtn.textContent = isPassword ? "🙈" : "👁️";
  }

  /** Show modal for adding a new provider. */
  showForAdd(): void {
    this.isEditing = false;
    this.currentProviderId = null;
    if (this.el) { resetForm(this.el); }
    updateModalTitle(this.modalEl, "Add Provider");
    showModal(this.modalEl, this.el?.providerSelect);
  }

  /** Show modal for editing an existing provider. */
  showForEdit(providerId: string, formData: Partial<EditProviderFormData>): void {
    this.isEditing = true;
    this.currentProviderId = providerId;
    if (this.el) { populateForm(this.el, formData); }
    updateModalTitle(this.modalEl, "Edit Provider");
    showModal(this.modalEl, this.el?.providerSelect);
  }

  /** Hide the modal. */
  hide(): void {
    hideModal(this.modalEl);
    clearModalStatus(this.modalEl);
  }

  /** Check if modal is visible. */
  isVisible(): boolean {
    return isModalVisible(this.modalEl);
  }

  /** Destroy the modal and clean up. */
  destroy(): void {
    destroyModal(this.modalEl);
    this.modalEl = null;
  }
}