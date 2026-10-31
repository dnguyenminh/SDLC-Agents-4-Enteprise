/**
 * ModelPickerRenderer — DOM rendering for model picker.
 * Extracted from ModelPickerPopup for SRP and line limits.
 */

import { ModelItem } from "./model-picker-popup.js";
import { PopupElements } from "./model-picker-dom.js";
import { groupModelsByProvider, renderGroupedModels, renderRecentModels } from "./model-picker-groups.js";

/** Render the model list and recent section. */
export function renderModelList(
  elements: PopupElements,
  allModels: ModelItem[],
  filteredModels: ModelItem[],
  recentModels: ModelItem[],
  escapeHtml: (str: string) => string
): void {
  // Render recent models
  if (recentModels.length > 0) {
    elements.recentSection.hidden = false;
    elements.recentListEl.innerHTML = renderRecentModels(recentModels, escapeHtml);
  } else {
    elements.recentSection.hidden = true;
  }

  // Render all models grouped by provider
  if (filteredModels.length > 0) {
    elements.emptyState.hidden = true;
    const groups = groupModelsByProvider(filteredModels);
    elements.modelListEl.innerHTML = renderGroupedModels(groups, escapeHtml);
  } else {
    elements.emptyState.hidden = false;
    elements.modelListEl.innerHTML = "";
  }
}

/** Position and show the popup. */
export function openPopup(elements: PopupElements, anchorEl?: HTMLElement): void {
  elements.popupEl.classList.remove("hidden");

  // Position near anchor if provided
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    elements.dialog.style.top = `${rect.bottom + 4}px`;
    elements.dialog.style.left = `${rect.left}px`;
  }

  // Focus search input
  setTimeout(() => { elements.searchInput?.focus(); }, 50);
}

/** Hide the popup and reset search. */
export function closePopup(elements: PopupElements): void {
  elements.popupEl.classList.add("hidden");
  elements.searchInput.value = "";
}