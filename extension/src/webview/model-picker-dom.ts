/**
 * ModelPickerDOM — DOM creation and event binding for model picker.
 * Extracted from ModelPickerPopup for SRP and line limits.
 */

import { ModelPickerCallbacks } from "./model-picker-popup.js";
import { SearchState } from "./model-picker-search.js";

export interface PopupElements {
  popupEl: HTMLElement;
  searchInput: HTMLInputElement;
  closeBtn: HTMLButtonElement;
  backdrop: HTMLElement;
  dialog: HTMLElement;
  modelListEl: HTMLElement;
  recentListEl: HTMLElement;
  recentSection: HTMLElement;
  emptyState: HTMLElement;
}

/**
 * Create the popup DOM element and return all queryable elements.
 */
export function createPopupElements(callbacks: ModelPickerCallbacks, searchState: SearchState): PopupElements {
  const popupEl = document.createElement("div");
  popupEl.className = "model-picker-popup hidden";
  popupEl.setAttribute("role", "dialog");
  popupEl.setAttribute("aria-modal", "true");
  popupEl.setAttribute("aria-label", "Select LLM Model");
  popupEl.innerHTML = getPopupHtml();
  document.body.appendChild(popupEl);

  const elements: PopupElements = {
    popupEl,
    searchInput: popupEl.querySelector("#picker-search") as HTMLInputElement,
    closeBtn: popupEl.querySelector("[data-action='close']") as HTMLButtonElement,
    backdrop: popupEl.querySelector(".model-picker-backdrop") as HTMLElement,
    dialog: popupEl.querySelector(".model-picker-dialog") as HTMLElement,
    modelListEl: popupEl.querySelector("#model-list") as HTMLElement,
    recentListEl: popupEl.querySelector("#recent-model-list") as HTMLElement,
    recentSection: popupEl.querySelector("#picker-recent") as HTMLElement,
    emptyState: popupEl.querySelector("#empty-state") as HTMLElement,
  };

  bindEvents(elements, callbacks, searchState);
  return elements;
}

/** Get the popup HTML template. */
function getPopupHtml(): string {
  return `
    <div class="model-picker-backdrop" data-action="close"></div>
    <div class="model-picker-dialog" role="document">
      <div class="model-picker-header">
        <h3>Select Model</h3>
        <button class="picker-close-btn" aria-label="Close" data-action="close">&times;</button>
      </div>
      <div class="model-picker-search">
        <label for="picker-search" class="visually-hidden">Search models</label>
        <input type="text" id="picker-search" placeholder="Search models..." autocomplete="off" aria-describedby="search-hint">
        <span id="search-hint" class="visually-hidden">Press Ctrl+F to focus search, Esc to close</span>
      </div>
      <div class="model-picker-content">
        <div class="model-picker-recent" id="picker-recent" hidden>
          <h4>Recent</h4>
          <div class="model-list" id="recent-model-list"></div>
        </div>
        <div class="model-picker-models">
          <h4>Models</h4>
          <div class="model-list" id="model-list"></div>
          <div class="empty-state" id="empty-state" hidden>
            <p>No models available</p>
            <p class="hint">Configure a provider in Settings first</p>
          </div>
        </div>
      </div>
      <div class="model-picker-footer">
        <kbd class="shortcut-hint"><kbd>Esc</kbd> Close</kbd>
        <kbd class="shortcut-hint"><kbd>Ctrl</kbd>+<kbd>A</kbd> Connect Integration</kbd>
        <kbd class="shortcut-hint"><kbd>Ctrl</kbd>+<kbd>F</kbd> Focus Search</kbd>
      </div>
    </div>
  `;
}

/** Bind event listeners to popup elements. */
function bindEvents(
  el: PopupElements,
  callbacks: ModelPickerCallbacks,
  searchState: SearchState
): void {
  let searchTimeout: ReturnType<typeof setTimeout>;
  el.searchInput?.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchState.query = target.value.trim().toLowerCase();
      callbacks.onSearchChange(searchState.query);
    }, 100);
  });

  el.closeBtn?.addEventListener("click", () => callbacks.onClose());
  el.backdrop?.addEventListener("click", () => callbacks.onClose());

  // Model item clicks (delegated)
  el.popupEl?.addEventListener("click", (e) => {
    const modelItem = (e.target as HTMLElement).closest(".model-item") as HTMLElement;
    if (modelItem) {
      const modelId = modelItem.dataset.modelId;
      callbacks.onModelClick(modelId);
    }
  });

  // Keyboard shortcuts
  el.popupEl?.addEventListener("keydown", (e) => callbacks.onKeyDown(e));

  // Prevent backdrop clicks from closing when clicking dialog
  el.dialog?.addEventListener("click", (e) => e.stopPropagation());
}

/** Destroy popup and clean up. */
export function destroyPopup(elements: PopupElements): void {
  elements.popupEl?.remove();
}