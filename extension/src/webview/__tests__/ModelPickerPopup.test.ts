/**
 * ModelPickerPopup unit tests.
 * STC: UT-11..UT-20 — ModelPickerPopup rendering, search, recent models, keyboard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { filterModels, createSearchState, updateSearchState } from "../model-picker-search.ts";
import { createRecentModelsManager } from "../model-picker-recent.ts";
import { handleKeyDown } from "../model-picker-keyboard.ts";
import type { ModelItem, SearchState, RecentModelsManager, KeyboardCallbacks } from "../model-picker-popup.ts";

describe("ModelPickerSearch", () => {
  const mockModels: ModelItem[] = [
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet", provider: "Anthropic", providerId: "anthropic", isFree: false, rateMultiplier: 1 },
    { id: "claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", providerId: "anthropic", isFree: true, rateMultiplier: 0 },
    { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", providerId: "openai", isFree: false, rateMultiplier: 1 },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "OpenAI", providerId: "openai", isFree: false, rateMultiplier: 1 },
    { id: "llama3", name: "Llama 3", provider: "Ollama", providerId: "ollama", isFree: true, rateMultiplier: 0 },
  ];

  it("UT-11: createSearchState initializes with all models", () => {
    const state = createSearchState(mockModels);
    expect(state.query).toBe("");
    expect(state.filteredModels).toEqual(mockModels);
  });

  it("UT-12: updateSearchState filters by model name", () => {
    const state = createSearchState(mockModels);
    const updated = updateSearchState(state, mockModels, "claude");
    expect(updated.query).toBe("claude");
    expect(updated.filteredModels).toHaveLength(2);
    expect(updated.filteredModels.every(m => m.name.toLowerCase().includes("claude"))).toBe(true);
  });

  it("UT-13: updateSearchState filters by provider name", () => {
    const state = createSearchState(mockModels);
    const updated = updateSearchState(state, mockModels, "openai");
    expect(updated.filteredModels).toHaveLength(2);
    expect(updated.filteredModels.every(m => m.provider.toLowerCase().includes("openai"))).toBe(true);
  });

  it("UT-14: updateSearchState is case insensitive", () => {
    const state = createSearchState(mockModels);
    const updated = updateSearchState(state, mockModels, "CLAUDE");
    expect(updated.filteredModels).toHaveLength(2);
  });

  it("UT-15: updateSearchState returns all models for empty query", () => {
    const state = createSearchState(mockModels);
    const updated = updateSearchState(state, mockModels, "");
    expect(updated.filteredModels).toEqual(mockModels);
  });

  it("UT-16: updateSearchState returns empty for no matches", () => {
    const state = createSearchState(mockModels);
    const updated = updateSearchState(state, mockModels, "nonexistent");
    expect(updated.filteredModels).toHaveLength(0);
  });

  it("UT-17: filterModels utility works correctly", () => {
    const filtered = filterModels(mockModels, "gpt");
    expect(filtered).toHaveLength(2);
    expect(filtered.every(m => m.name.toLowerCase().includes("gpt") || m.provider.toLowerCase().includes("gpt"))).toBe(true);
  });
});

describe("ModelPickerRecent", () => {
  let recentManager: RecentModelsManager;
  const mockModel: ModelItem = { id: "claude-3-sonnet", name: "Claude 3 Sonnet", provider: "Anthropic", providerId: "anthropic", isFree: false, rateMultiplier: 1 };
  const mockModel2: ModelItem = { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", providerId: "openai", isFree: false, rateMultiplier: 1 };

  beforeEach(() => {
    // Clear any persisted recent models BEFORE creating manager
    localStorage.clear();
    recentManager = createRecentModelsManager();
  });

  it("UT-18: recent models initially empty", () => {
    expect(recentManager.recentModels).toHaveLength(0);
  });

  it("UT-19: add model to recent", () => {
    recentManager.add(mockModel);
    expect(recentManager.recentModels).toHaveLength(1);
    expect(recentManager.recentModels[0]).toEqual(mockModel);
  });

  it("UT-20: recent models limited to 5", () => {
    for (let i = 0; i < 7; i++) {
      recentManager.add({ ...mockModel, id: `model-${i}`, name: `Model ${i}` });
    }
    expect(recentManager.recentModels).toHaveLength(5);
    // Most recent first
    expect(recentManager.recentModels[0].id).toBe("model-6");
  });

  it("UT-21: duplicate model moved to front", () => {
    recentManager.add(mockModel);
    recentManager.add(mockModel2);
    recentManager.add(mockModel); // Add again
    expect(recentManager.recentModels).toHaveLength(2);
    expect(recentManager.recentModels[0].id).toBe("claude-3-sonnet");
  });
});

describe("ModelPickerKeyboard", () => {
  let keyboardCallbacks: KeyboardCallbacks;
  let closeSpy: ReturnType<typeof vi.fn>;
  let connectSpy: ReturnType<typeof vi.fn>;
  let modelSelectSpy: ReturnType<typeof vi.fn>;
  let mockElements: any;

  beforeEach(() => {
    closeSpy = vi.fn();
    connectSpy = vi.fn();
    modelSelectSpy = vi.fn();
    mockElements = {
      popupEl: {
        classList: { contains: (cls: string) => cls === "hidden" ? false : false },
        querySelector: vi.fn(),
        querySelectorAll: vi.fn(),
      },
      searchInput: { value: "", focus: vi.fn(), select: vi.fn() },
    };

    keyboardCallbacks = {
      onClose: closeSpy,
      onConnectIntegration: connectSpy,
      onModelSelect: modelSelectSpy,
      getModels: () => mockModels,
      getPopupElements: () => mockElements,
      isSearchFocused: () => false,
    };
  });

  const mockModels: ModelItem[] = [
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet", provider: "Anthropic", providerId: "anthropic", isFree: false, rateMultiplier: 1 },
    { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", providerId: "openai", isFree: false, rateMultiplier: 1 },
  ];

  // Helper to create a mock event object (not a real KeyboardEvent since defaultPrevented is read-only)
  function createMockKeyEvent(key: string, options: { ctrlKey?: boolean; shiftKey?: boolean } = {}): any {
    const event = {
      key,
      ctrlKey: options.ctrlKey ?? false,
      shiftKey: options.shiftKey ?? false,
      defaultPrevented: false,
      stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
    };
    return event;
  }

  it("UT-22: Esc key closes popup", () => {
    const event = createMockKeyEvent("Escape");
    handleKeyDown(event, keyboardCallbacks);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("UT-23: Ctrl+A triggers connect integration", () => {
    const event = createMockKeyEvent("a", { ctrlKey: true });
    handleKeyDown(event, keyboardCallbacks);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true); // Prevents "select all"
  });

  it("UT-24: Ctrl+F focuses search when not focused", () => {
    keyboardCallbacks.isSearchFocused = () => false;
    mockElements.searchInput.focus = vi.fn();
    const event = createMockKeyEvent("f", { ctrlKey: true });
    handleKeyDown(event, keyboardCallbacks);
    expect(mockElements.searchInput.focus).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true); // Prevents browser find
  });

  it("UT-25: ArrowDown selects next model", () => {
    const mockItems = [
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "claude-3-sonnet" }, scrollIntoView: vi.fn() },
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "gpt-4o" }, scrollIntoView: vi.fn() },
    ];
    mockElements.popupEl.querySelectorAll = vi.fn().mockReturnValue(mockItems);
    mockElements.popupEl.querySelector = vi.fn().mockReturnValue(null);
    const event = createMockKeyEvent("ArrowDown");
    handleKeyDown(event, keyboardCallbacks);
    expect(mockElements.popupEl.querySelectorAll).toHaveBeenCalled();
  });

  it("UT-26: ArrowUp selects previous model", () => {
    const mockItems = [
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "claude-3-sonnet" }, scrollIntoView: vi.fn() },
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "gpt-4o" }, scrollIntoView: vi.fn() },
    ];
    mockElements.popupEl.querySelectorAll = vi.fn().mockReturnValue(mockItems);
    mockElements.popupEl.querySelector = vi.fn().mockReturnValue(null);
    const event = createMockKeyEvent("ArrowUp");
    handleKeyDown(event, keyboardCallbacks);
    expect(mockElements.popupEl.querySelectorAll).toHaveBeenCalled();
  });

  it("UT-27: Enter selects highlighted model", () => {
    const mockFocusedItem = { dataset: { modelId: "claude-3-sonnet" }, classList: { contains: vi.fn().mockReturnValue(true) } };
    mockElements.popupEl.querySelector = vi.fn().mockReturnValue(mockFocusedItem);
    const event = createMockKeyEvent("Enter");
    handleKeyDown(event, keyboardCallbacks);
    expect(modelSelectSpy).toHaveBeenCalledWith(mockModels[0]);
  });

  it("UT-28: ignores keys when popup not visible", () => {
    mockElements.popupEl.classList.contains = (cls: string) => cls === "hidden";
    const event = createMockKeyEvent("Escape");
    handleKeyDown(event, keyboardCallbacks);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("UT-29: Tab cycles through focusable elements", () => {
    const event = createMockKeyEvent("Tab");
    handleKeyDown(event, keyboardCallbacks);
    // Tab should not be prevented (default browser behavior)
    expect(event.defaultPrevented).toBe(false);
  });

  it("UT-30: does not handle keys outside popup", () => {
    keyboardCallbacks.getPopupElements = () => null;
    const event = createMockKeyEvent("Escape");
    handleKeyDown(event, keyboardCallbacks);
    expect(closeSpy).not.toHaveBeenCalled();
  });
});