/**
 * Model Picker E2E tests.
 * STC: E2E-UI-09..E2E-UI-16 — Model Picker flows.
 */

import { test, expect } from "@playwright/test";

test.describe("Model Picker - Chat Panel", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to chat panel
    await page.goto("vscode://sdlcAgents.openChat");
    await page.waitForSelector(".chat-panel");
  });

  test("E2E-UI-09: Model Picker popup opens and replaces plain dropdown", async ({ page }) => {
    await page.click(".model-selector-button");
    await expect(page.locator(".model-picker-popup")).not.toHaveClass("hidden");
    await expect(page.locator(".picker-search")).toBeVisible();
    await expect(page.locator(".picker-recent")).toBeVisible();
    await expect(page.locator(".picker-model-list")).toBeVisible();
  });

  test("E2E-UI-10: Model Picker selection switches model in ONE operation", async ({ page }) => {
    await page.click(".model-selector-button");
    await page.click(".model-item:has-text('Claude 3 Sonnet')");
    await expect(page.locator(".model-picker-popup")).toHaveClass("hidden");
    await expect(page.locator(".current-model-display")).toHaveText("Claude 3 Sonnet");
  });

  test("E2E-UI-11: Search filter in Model Picker works in real-time", async ({ page }) => {
    await page.click(".model-selector-button");
    await page.fill(".picker-search", "gpt");
    await expect(page.locator(".model-item")).toHaveCount(2); // GPT-4o, GPT-3.5 Turbo
    await expect(page.locator(".model-item:has-text('Claude')")).not.toBeVisible();
  });

  test("E2E-UI-12: Recent section shows recently used models", async ({ page }) => {
    await page.click(".model-selector-button");
    await page.click(".model-item:has-text('Claude 3 Sonnet')");
    await page.click(".model-selector-button");
    await expect(page.locator(".picker-recent .model-item")).toHaveCount(1);
    await expect(page.locator(".picker-recent .model-item")).toHaveText("Claude 3 Sonnet");
  });

  test("E2E-UI-13: Model row displays name, provider, and Free badge correctly", async ({ page }) => {
    await page.click(".model-selector-button");
    const modelItem = page.locator(".model-item:has-text('Claude 3 Haiku')");
    await expect(modelItem.locator(".model-item-name")).toHaveText("Claude 3 Haiku");
    await expect(modelItem.locator(".model-item-provider")).toHaveText("Anthropic");
    await expect(modelItem.locator(".model-item-free-badge")).toHaveText("Free");
  });

  test("E2E-UI-14: Keyboard shortcut Esc closes Model Picker", async ({ page }) => {
    await page.click(".model-selector-button");
    await page.keyboard.press("Escape");
    await expect(page.locator(".model-picker-popup")).toHaveClass("hidden");
  });

  test("E2E-UI-15: Keyboard shortcut Ctrl+F focuses search field", async ({ page }) => {
    await page.click(".model-selector-button");
    await page.keyboard.press("Control+F");
    await expect(page.locator(".picker-search")).toBeFocused();
  });

  test("E2E-UI-16: Shortcut keys do not conflict with editor/OS defaults", async ({ page }) => {
    await page.click(".model-selector-button");
    // Ctrl+A should not trigger "select all" in search
    await page.fill(".picker-search", "test");
    await page.keyboard.press("Control+A");
    // Should trigger connect integration, not select all text
    await expect(page.locator(".picker-search")).not.toHaveText("test"); // Selection would be different
  });

  test("E2E-UI-17: Model Picker handles 50+ models without performance degradation", async ({ page }) => {
    await page.click(".model-selector-button");
    const start = Date.now();
    await page.fill(".picker-search", "a");
    const filterTime = Date.now() - start;
    expect(filterTime).toBeLessThan(100); // < 100ms per NFR2
  });

  test("E2E-UI-18: No connected providers - picker shows 'No models available'", async ({ page }) => {
    // This test requires a clean state with no connected providers
    // Would need test setup to reset configuration
    await page.click(".model-selector-button");
    await expect(page.locator(".picker-model-list .empty-state")).toBeVisible();
  });
});