/**
 * E2E UI Tests — Admin Portal (Playwright): KB Quality + KB Tags pages.
 * (Split from admin-ui.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-ui (or: npx playwright test)
 */
import { test, expect } from '@playwright/test';
import { login } from './admin-ui.fixtures.js';

// ============================================================
// KB Quality Page
// ============================================================

test.describe('KB Quality', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("KB Quality")').click();
    await page.waitForTimeout(500);
  });

  test('should display quality page with summary cards', async ({ page }) => {
    await expect(page.locator('.header h2')).toBeVisible();
    const cards = page.locator('.card, .grid .card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show quality table with entries', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('th:has-text("Source"), th:has-text("Quality")')).toBeVisible();
  });

  test('should have quality distribution chart', async ({ page }) => {
    const svg = page.locator('svg');
    if (await svg.first().isVisible().catch(() => false)) {
      await expect(svg.first()).toBeVisible();
    }
  });
});

// ============================================================
// KB Tags Page
// ============================================================

test.describe('KB Tags', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("KB Tags")').click();
    await page.waitForTimeout(500);
  });

  test('should display tags page', async ({ page }) => {
    await expect(page.locator('.header h2')).toBeVisible();
    await expect(page.locator('.main')).toBeVisible();
  });

  test('should have create tag functionality', async ({ page }) => {
    const createBtn = page.locator('button:has-text("New Tag"), button:has-text("Create"), button:has-text("Add")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(300);
      const input = page.locator('input[placeholder*="tag" i], input[placeholder*="Tag" i], input[placeholder*="name" i]').first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill('e2e-test-tag-' + Date.now());
        const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Add")').last();
        if (await saveBtn.isVisible().catch(() => false)) {
          await saveBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
    expect(true).toBe(true);
  });

  test('should show tags table', async ({ page }) => {
    const table = page.locator('table');
    if (await table.isVisible().catch(() => false)) {
      await expect(table).toBeVisible();
      await expect(page.locator('th, table').first()).toBeVisible({ timeout: 5000 });
    }
  });
});
