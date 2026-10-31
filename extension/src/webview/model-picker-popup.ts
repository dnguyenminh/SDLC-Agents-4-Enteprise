/**
 * Model Picker Popup — Replaces the simple model dropdown in Chat panel.
 * Features: Search filter, Recent section, Model list with name/provider/Free badge.
 * Keyboard shortcuts: Esc (close), Ctrl+A (connect integration), Ctrl+F (focus search).
 */

export interface ModelItem {
  id: string;
  name: string;
  provider: string;      // Provider name (Anthropic, OpenAI, etc.)
  providerId: string;    // Provider ID (anthropic, openai, etc.)
  isFree: boolean;
  rateMultiplier?: number;
  description?: string;
}

export interface ModelPickerCallbacks {
  onModelSelect: (model: ModelItem) => void;
  onClose: () => void;
  onConnectIntegration: () => void;
}

import { ModelPickerCallbacks as CallbackType } from "./model-picker-popup.js";
import { filterModels, createSearchState, updateSearchState, SearchState } from "./model-picker-search.js";
import { createPopupElements, destroyPopup, PopupElements } from "./model-picker-dom.js";
import { handleKeyDown, KeyboardCallbacks } from "./model-picker-keyboard.js";
import { renderModelList, openPopup, closePopup } from "./model-picker-renderer.js";
import { createRecentModelsManager, RecentModelsManager } from "./model-picker-recent.js";

/**
 * ModelPickerPopup — manages the model picker popup UI.
 * Delegates to specialized modules for DOM, keyboard, rendering, search, and recent models.
 */
export class ModelPickerPopup {
  private elements: PopupElements | null = null;
  private callbacks: ModelPickerCallbacks;
  private allModels: ModelItem[] = [];
  private searchState: SearchState = createSearchState([]);
  private recentManager: RecentModelsManager;

  constructor(callbacks: ModelPickerCallbacks) {
    this.callbacks = callbacks;
    this.recentManager = createRecentModelsManager();
    this.createPopup();
  }

  /** Create the popup DOM structure and bind events. */
  private createPopup(): void {
    this.elements = createPopupElements(this.callbacks, this.searchState);
    // Override the search change handler to use our search logic
    this.elements.popupEl!.removeEventListener("input", this.handleSearchInput.bind(this));
    this.bindSearchInput();
  }

  /** Bind search input with custom filtering logic. */
  private bindSearchInput(): void {
    const searchInput = this.elements?.searchInput;
    if (!searchInput) { return; }

    let searchTimeout: ReturnType<typeof setTimeout>;
    searchInput.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.searchState = updateSearchState(this.searchState, this.allModels, target.value);
        this.render();
      }, 100);
    });
  }

  /** Set the available models and render. */
  setModels(models: ModelItem[]): void {
    this.allModels = models;
    this.searchState = createSearchState(models);
    this.render();
  }

  /** Render the model list and recent section. */
  private render(): void {
    if (!this.elements) { return; }
    renderModelList(
      this.elements,
      this.allModels,
      this.searchState.filteredModels,
      this.recentManager.recentModels,
      this.escapeHtml.bind(this)
    );
  }

  /** Handle keyboard events. */
  private handleKeyDown(e: KeyboardEvent): void {
    const keyboardCallbacks: KeyboardCallbacks = {
      onClose: () => this.close(),
      onConnectIntegration: () => this.callbacks.onConnectIntegration(),
      onModelSelect: (model) => this.selectModel(model),
      getModels: () => this.allModels,
      getPopupElements: () => this.elements,
      isSearchFocused: () => document.activeElement === this.elements?.searchInput,
    };
    handleKeyDown(e, keyboardCallbacks);
  }

  /** Select a model and close popup. */
  private selectModel(model: ModelItem): void {
    this.recentManager.add(model);
    this.callbacks.onModelSelect(model);
    this.close();
  }

  /** Open the popup at the given anchor element position. */
  open(anchorEl?: HTMLElement): void {
    if (!this.elements || this.isVisible()) { return; }
    openPopup(this.elements, anchorEl);
    this.render();
  }

  /** Close the popup. */
  close(): void {
    if (!this.elements || !this.isVisible()) { return; }
    closePopup(this.elements);
    this.searchState = updateSearchState(this.searchState, this.allModels, "");
    this.callbacks.onClose();
  }

  /** Check if popup is open. */
  isVisible(): boolean {
    return this.elements?.popupEl?.classList.contains("hidden") === false;
  }

  /** Destroy the popup and clean up. */
  destroy(): void {
    if (this.elements) { destroyPopup(this.elements); }
    this.elements = null;
  }

  /** Escape HTML to prevent XSS. */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, """)
      .replace(/'/g, "'");
  }
}