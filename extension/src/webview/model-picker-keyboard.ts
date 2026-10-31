/**
 * ModelPickerKeyboard — keyboard navigation for model picker.
 * Extracted from ModelPickerPopup for SRP and line limits.
 */

import { ModelItem } from "./model-picker-popup.js";
import { PopupElements } from "./model-picker-dom.js";

export interface KeyboardCallbacks {
  onClose: () => void;
  onConnectIntegration: () => void;
  onModelSelect: (model: ModelItem) => void;
  getModels: () => ModelItem[];
  getPopupElements: () => PopupElements | null;
  isSearchFocused: () => boolean;
}

/** Handle keyboard events within popup context. */
export function handleKeyDown(e: KeyboardEvent, callbacks: KeyboardCallbacks): void {
  const { isOpen, isSearchFocused } = getKeyboardState(callbacks);
  if (!isOpen) { return; }

  // Escape - close popup
  if (e.key === "Escape") {
    e.preventDefault(); e.stopPropagation(); callbacks.onClose(); return;
  }

  // Ctrl+A - Connect integration (only when NOT in search input to avoid select-all)
  if (e.key === "a" && e.ctrlKey && !isSearchFocused) {
    e.preventDefault(); e.stopPropagation(); callbacks.onConnectIntegration(); return;
  }

  // Ctrl+F - Focus search field
  if (e.key === "f" && e.ctrlKey) {
    e.preventDefault(); e.stopPropagation(); focusSearchInput(callbacks); return;
  }

  // Arrow navigation in model list
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isSearchFocused) {
    e.preventDefault(); navigateModels(e.key === "ArrowDown" ? 1 : -1, callbacks);
  }

  // Home - select first model
  if (e.key === "Home" && !isSearchFocused) {
    e.preventDefault(); navigateToFirstModel(callbacks); return;
  }

  // End - select last model
  if (e.key === "End" && !isSearchFocused) {
    e.preventDefault(); navigateToLastModel(callbacks); return;
  }

  // Enter to select focused model
  if (e.key === "Enter" && !isSearchFocused) {
    e.preventDefault(); selectFocusedModel(callbacks);
  }
}

function getKeyboardState(callbacks: KeyboardCallbacks): { isOpen: boolean; isSearchFocused: boolean } {
  const elements = callbacks.getPopupElements();
  const isOpen = elements?.popupEl?.classList.contains("hidden") === false;
  const isSearchFocused = callbacks.isSearchFocused();
  return { isOpen: !!isOpen, isSearchFocused };
}

function focusSearchInput(callbacks: KeyboardCallbacks): void {
  const elements = callbacks.getPopupElements();
  elements?.searchInput?.focus();
  elements?.searchInput?.select();
}

function navigateModels(direction: number, callbacks: KeyboardCallbacks): void {
  const elements = callbacks.getPopupElements();
  const items = elements?.popupEl?.querySelectorAll(".model-item:not(.hidden)") as NodeListOf<HTMLElement>;
  if (!items || items.length === 0) { return; }

  const currentFocused = elements?.popupEl?.querySelector(".model-item.focused") as HTMLElement;
  let currentIndex = -1;
  if (currentFocused) {
    currentIndex = Array.from(items).indexOf(currentFocused);
    currentFocused.classList.remove("focused");
  }

  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = items.length - 1;
  if (nextIndex >= items.length) nextIndex = 0;

  items[nextIndex]?.classList.add("focused");
  items[nextIndex]?.scrollIntoView({ block: "nearest" });
}

function selectFocusedModel(callbacks: KeyboardCallbacks): void {
  const elements = callbacks.getPopupElements();
  const focusedItem = elements?.popupEl?.querySelector(".model-item.focused") as HTMLElement;
  if (focusedItem) {
    const modelId = focusedItem.dataset.modelId;
    const model = callbacks.getModels().find((m) => m.id === modelId);
    if (model) { callbacks.onModelSelect(model); }
  }
}

function navigateToFirstModel(callbacks: KeyboardCallbacks): void {
  const elements = callbacks.getPopupElements();
  const items = elements?.popupEl?.querySelectorAll(".model-item:not(.hidden)") as NodeListOf<HTMLElement>;
  if (!items || items.length === 0) { return; }

  const currentFocused = elements?.popupEl?.querySelector(".model-item.focused") as HTMLElement;
  if (currentFocused) {
    currentFocused.classList.remove("focused");
  }

  items[0]?.classList.add("focused");
  items[0]?.scrollIntoView?.({ block: "nearest" });
}

function navigateToLastModel(callbacks: KeyboardCallbacks): void {
  const elements = callbacks.getPopupElements();
  const items = elements?.popupEl?.querySelectorAll(".model-item:not(.hidden)") as NodeListOf<HTMLElement>;
  if (!items || items.length === 0) { return; }

  const currentFocused = elements?.popupEl?.querySelector(".model-item.focused") as HTMLElement;
  if (currentFocused) {
    currentFocused.classList.remove("focused");
  }

  const lastIndex = items.length - 1;
  items[lastIndex]?.classList.add("focused");
  items[lastIndex]?.scrollIntoView?.({ block: "nearest" });
}