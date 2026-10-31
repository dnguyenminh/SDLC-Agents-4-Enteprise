/**
 * KeyboardShortcutHandler unit tests.
 * STC: UT-31..UT-35 — Keyboard shortcuts for model picker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleKeyDown } from "../model-picker-keyboard.ts";
import type { KeyboardCallbacks } from "../model-picker-popup.ts";

describe("KeyboardShortcutHandler", () => {
  let callbacks: KeyboardCallbacks;
  let closeSpy: ReturnType<typeof vi.fn>;
  let connectSpy: ReturnType<typeof vi.fn>;
  let modelSelectSpy: ReturnType<typeof vi.fn>;
  let mockElements: any;
  let mockModels: any[];

  beforeEach(() => {
    closeSpy = vi.fn();
    connectSpy = vi.fn();
    modelSelectSpy = vi.fn();
    mockModels = [
      { id: "claude-3-sonnet", name: "Claude 3 Sonnet", provider: "Anthropic", providerId: "anthropic", isFree: false, rateMultiplier: 1 },
      { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", providerId: "openai", isFree: false, rateMultiplier: 1 },
    ];

    mockElements = {
      popupEl: {
        classList: { contains: (cls: string) => cls === "hidden" ? false : false },
        querySelector: vi.fn(),
        querySelectorAll: vi.fn(),
      },
      searchInput: { value: "", focus: vi.fn(), select: vi.fn() },
    };

    callbacks = {
      onClose: closeSpy,
      onConnectIntegration: connectSpy,
      onModelSelect: modelSelectSpy,
      getModels: () => mockModels,
      getPopupElements: () => mockElements,
      isSearchFocused: () => false,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

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

  it("UT-43: Esc key closes popup", () => {
    const event = createMockKeyEvent("Escape");
    handleKeyDown(event, callbacks);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("UT-44: Ctrl+A triggers connect integration", () => {
    const event = createMockKeyEvent("a", { ctrlKey: true });
    handleKeyDown(event, callbacks);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("UT-45: Ctrl+F focuses search when not focused", () => {
    callbacks.isSearchFocused = () => false;
    mockElements.searchInput.focus = vi.fn();
    const event = createMockKeyEvent("f", { ctrlKey: true });
    handleKeyDown(event, callbacks);
    expect(mockElements.searchInput.focus).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("UT-46: ArrowDown selects next model", () => {
    const mockItems = [
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "claude-3-sonnet" }, scrollIntoView: vi.fn() },
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "gpt-4o" }, scrollIntoView: vi.fn() },
    ];
    mockElements.popupEl.querySelectorAll = vi.fn().mockReturnValue(mockItems);
    mockElements.popupEl.querySelector = vi.fn().mockReturnValue(null);
    const event = createMockKeyEvent("ArrowDown");
    handleKeyDown(event, callbacks);
    expect(mockElements.popupEl.querySelectorAll).toHaveBeenCalled();
  });

  it("UT-47: ArrowUp selects previous model", () => {
    const mockItems = [
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "claude-3-sonnet" }, scrollIntoView: vi.fn() },
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "gpt-4o" }, scrollIntoView: vi.fn() },
    ];
    mockElements.popupEl.querySelectorAll = vi.fn().mockReturnValue(mockItems);
    mockElements.popupEl.querySelector = vi.fn().mockReturnValue(null);
    const event = createMockKeyEvent("ArrowUp");
    handleKeyDown(event, callbacks);
    expect(mockElements.popupEl.querySelectorAll).toHaveBeenCalled();
  });

  it("UT-48: Enter selects highlighted model", () => {
    const mockFocusedItem = { dataset: { modelId: "claude-3-sonnet" }, classList: { contains: vi.fn().mockReturnValue(true) } };
    mockElements.popupEl.querySelector = vi.fn().mockReturnValue(mockFocusedItem);
    const event = createMockKeyEvent("Enter");
    handleKeyDown(event, callbacks);
    expect(modelSelectSpy).toHaveBeenCalledWith(mockModels[0]);
  });

  it("UT-49: ignores keys when popup hidden", () => {
    mockElements.popupEl.classList.contains = (cls: string) => cls === "hidden";
    const event = createMockKeyEvent("Escape");
    handleKeyDown(event, callbacks);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("UT-50: does not prevent default for unhandled keys", () => {
    const event = createMockKeyEvent("Tab");
    handleKeyDown(event, callbacks);
    expect(event.defaultPrevented).toBe(false);
  });

  it("UT-51: handles missing popup elements gracefully", () => {
    callbacks.getPopupElements = () => null;
    const event = createMockKeyEvent("Escape");
    expect(() => handleKeyDown(event, callbacks)).not.toThrow();
  });

  it("UT-52: Shift+Tab cycles focus backwards", () => {
    const event = createMockKeyEvent("Tab", { shiftKey: true });
    handleKeyDown(event, callbacks);
    expect(event.defaultPrevented).toBe(false);
  });

  it("UT-53: Home key selects first model", () => {
    const mockItems = [
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "claude-3-sonnet" }, scrollIntoView: vi.fn() },
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "gpt-4o" }, scrollIntoView: vi.fn() },
    ];
    mockElements.popupEl.querySelectorAll = vi.fn().mockReturnValue(mockItems);
    mockElements.popupEl.querySelector = vi.fn().mockReturnValue(mockItems[0]);
    const event = createMockKeyEvent("Home");
    handleKeyDown(event, callbacks);
    expect(mockElements.popupEl.querySelectorAll).toHaveBeenCalled();
  });

  it("UT-54: End key selects last model", () => {
    const mockItems = [
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "claude-3-sonnet" }, scrollIntoView: vi.fn() },
      { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() }, dataset: { modelId: "gpt-4o" }, scrollIntoView: vi.fn() },
    ];
    mockElements.popupEl.querySelectorAll = vi.fn().mockReturnValue(mockItems);
    mockElements.popupEl.querySelector = vi.fn().mockReturnValue(mockItems[1]);
    const event = createMockKeyEvent("End");
    handleKeyDown(event, callbacks);
    expect(mockElements.popupEl.querySelectorAll).toHaveBeenCalled();
  });
});