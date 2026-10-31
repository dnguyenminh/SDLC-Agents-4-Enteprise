/**
 * Keyboard Shortcut Handler — Handles keyboard events within Model Picker context.
 * Shortcuts: Esc (close), Ctrl+A (connect integration), Ctrl+F (focus search).
 * Scoped to Model Picker popup only — no editor/OS conflicts.
 */

export interface KeyboardShortcutCallbacks {
  onClose: () => void;
  onConnectIntegration: () => void;
  onFocusSearch: () => void;
}

/**
 * KeyboardShortcutHandler — manages keyboard shortcuts for the Model Picker.
 * Attaches listeners to the popup container (not document) to avoid conflicts.
 */
export class KeyboardShortcutHandler {
  private popupEl: HTMLElement | null = null;
  private callbacks: KeyboardShortcutCallbacks;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;

  constructor(popupEl: HTMLElement, callbacks: KeyboardShortcutCallbacks) {
    this.popupEl = popupEl;
    this.callbacks = callbacks;
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.attachEvents();
  }

  /** Attach keyboard event listener to popup container. */
  private attachEvents(): void {
    if (this.popupEl) {
      this.popupEl.addEventListener("keydown", this.boundHandleKeyDown);
    }
  }

  /** Detach keyboard event listener. */
  detach(): void {
    if (this.popupEl) {
      this.popupEl.removeEventListener("keydown", this.boundHandleKeyDown);
    }
  }

  /** Handle keydown events scoped to the popup. */
  private handleKeyDown(e: KeyboardEvent): void {
    // Only handle when popup is the active modal (has focus or contains focused element)
    const activeEl = document.activeElement;
    const isPopupFocused =
      this.popupEl === activeEl ||
      this.popupEl?.contains(activeEl) ||
      // Also handle when a model item button is focused
      (activeEl?.classList.contains("model-item") && this.popupEl?.contains(activeEl));

    if (!isPopupFocused) { return; }

    const searchInput = this.popupEl?.querySelector("#picker-search") as HTMLInputElement;
    const isSearchFocused = activeEl === searchInput;

    // Escape - close popup
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onClose();
      return;
    }

    // Ctrl+A - Connect integration (prevent "Select All" in search)
    if (e.key === "a" && e.ctrlKey && !isSearchFocused) {
      e.preventDefault(); // Prevent default "Select All" behavior
      e.stopPropagation();
      this.callbacks.onConnectIntegration();
      return;
    }

    // Ctrl+F - Focus search field (prevent browser "Find")
    if (e.key === "f" && e.ctrlKey) {
      e.preventDefault(); // Prevent browser's find dialog
      e.stopPropagation();
      this.callbacks.onFocusSearch();
      return;
    }

    // Arrow navigation for model items (when search not focused)
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isSearchFocused) {
      e.preventDefault();
      this.navigateModelItems(e.key === "ArrowDown" ? 1 : -1);
      return;
    }

    // Enter to select focused model item
    if (e.key === "Enter" && !isSearchFocused) {
      const focusedItem = this.popupEl?.querySelector(".model-item.focused") as HTMLElement;
      if (focusedItem) {
        e.preventDefault();
        focusedItem.click();
      }
    }
  }

  /** Navigate model items with arrow keys. */
  private navigateModelItems(direction: number): void {
    if (!this.popupEl) { return; }

    const items = this.popupEl.querySelectorAll(".model-item:not(.hidden)") as NodeListOf<HTMLElement>;
    if (items.length === 0) { return; }

    const currentFocused = this.popupEl.querySelector(".model-item.focused") as HTMLElement;
    let currentIndex = -1;

    if (currentFocused) {
      currentIndex = Array.from(items).indexOf(currentFocused);
      currentFocused.classList.remove("focused");
    }

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) { nextIndex = items.length - 1; }
    if (nextIndex >= items.length) { nextIndex = 0; }

    const nextItem = items[nextIndex];
    if (nextItem) {
      nextItem.classList.add("focused");
      nextItem.focus();
      nextItem.scrollIntoView({ block: "nearest" });
    }
  }

  /** Update the popup element reference (e.g., after re-render). */
  setPopupElement(popupEl: HTMLElement): void {
    this.detach();
    this.popupEl = popupEl;
    this.attachEvents();
  }
}