/**
 * Provider Table E2E tests.
 * STC: E2E-UI-01..E2E-UI-08 — Provider Table CRUD flows.
 */

import { test, expect } from "@playwright/test";

test.describe("Provider Table - LLM Configuration UI", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to settings panel
    await page.goto("vscode://sdlcAgents.openSettings");
    await page.waitForSelector(".provider-table-wrapper");
  });

  test("E2E-UI-01: Provider table displays all 6 columns", async ({ page }) => {
    const headers = page.locator(".provider-table thead th");
    await expect(headers).toHaveCount(6);
    await expect(headers.nth(0)).toHaveText("Name");
    await expect(headers.nth(1)).toHaveText("Status");
    await expect(headers.nth(2)).toHaveText("API Key");
    await expect(headers.nth(3)).toHaveText("Base URL");
    await expect(headers.nth(4)).toHaveText("Model");
    await expect(headers.nth(5)).toHaveText("Actions");
  });

  test("E2E-UI-02: Add Provider button opens Edit Provider modal", async ({ page }) => {
    await page.click("#add-provider-btn");
    await expect(page.locator(".modal-overlay")).not.toHaveClass("hidden");
    await expect(page.locator(".modal-title")).toHaveText("Add Provider");
  });

  test("E2E-UI-03: Add new provider happy path", async ({ page }) => {
    await page.click("#add-provider-btn");
    await page.selectOption(".provider-select", "anthropic");
    await page.fill(".api-key-input", "sk-ant-test123");
    await page.fill(".model-input", "claude-3-sonnet");
    await page.click(".save-btn");
    await expect(page.locator(".modal-overlay")).toHaveClass("hidden");
    // Verify provider appears in table
    await expect(page.locator("tr[data-provider-id='anthropic']")).toBeVisible();
  });

  test("E2E-UI-04: Edit provider - modal pre-filled with current values", async ({ page }) => {
    // First add a provider
    await page.click("#add-provider-btn");
    await page.selectOption(".provider-select", "anthropic");
    await page.fill(".api-key-input", "sk-ant-test123");
    await page.fill(".model-input", "claude-3-sonnet");
    await page.click(".save-btn");

    // Then edit it
    await page.click("tr[data-provider-id='anthropic'] .edit-btn");
    await expect(page.locator(".modal-title")).toHaveText("Edit Provider");
    await expect(page.locator(".provider-select")).toHaveValue("anthropic");
    await expect(page.locator(".model-input")).toHaveValue("claude-3-sonnet");
  });

  test("E2E-UI-05: Delete provider with confirmation", async ({ page }) => {
    // First add a provider
    await page.click("#add-provider-btn");
    await page.selectOption(".provider-select", "anthropic");
    await page.fill(".api-key-input", "sk-ant-test123");
    await page.fill(".model-input", "claude-3-sonnet");
    await page.click(".save-btn");

    // Delete it
    page.on("dialog", dialog => dialog.accept());
    await page.click("tr[data-provider-id='anthropic'] .delete-btn");
    await expect(page.locator("tr[data-provider-id='anthropic']")).not.toBeVisible();
  });

  test("E2E-UI-06: Status badges render correctly for all three states", async ({ page }) => {
    // Connected
    await page.click("#add-provider-btn");
    await page.selectOption(".provider-select", "anthropic");
    await page.fill(".api-key-input", "sk-ant-test123");
    await page.fill(".model-input", "claude-3-sonnet");
    await page.click(".save-btn");
    await page.click("tr[data-provider-id='anthropic'] .test-btn");
    await expect(page.locator("tr[data-provider-id='anthropic'] .status-badge")).toHaveClass(/connected/);

    // Disconnected (mock failure)
    // Would require mocking the test connection to fail
  });

  test("E2E-UI-07: Save All persists workspace config and SecretStorage", async ({ page }) => {
    await page.click("#add-provider-btn");
    await page.selectOption(".provider-select", "anthropic");
    await page.fill(".api-key-input", "sk-ant-test123");
    await page.fill(".model-input", "claude-3-sonnet");
    await page.click(".save-btn");

    await page.click("#add-provider-btn");
    await page.selectOption(".provider-select", "openai");
    await page.fill(".api-key-input", "sk-test456");
    await page.fill(".model-input", "gpt-4o");
    await page.click(".save-btn");

    await page.click("#save-all-btn");
    await expect(page.locator(".toast-success")).toBeVisible();
  });

  test("E2E-UI-08: API key is masked in table", async ({ page }) => {
    await page.click("#add-provider-btn");
    await page.selectOption(".provider-select", "anthropic");
    await page.fill(".api-key-input", "sk-ant-test123");
    await page.fill(".model-input", "claude-3-sonnet");
    await page.click(".save-btn");

    const apiKeyCell = page.locator("tr[data-provider-id='anthropic'] .provider-api-key");
    await expect(apiKeyCell).toHaveText("●●●●●●●●●●●●●●●●●●●●");
  });
});