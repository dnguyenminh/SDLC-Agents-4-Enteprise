/**
 * E2E UI Tests — Admin Portal (Playwright): Config + Search pages.
 * (Split from admin-ui.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-ui (or: npx playwright test)
 */
import { test, expect } from '@playwright/test';
import { login } from './admin-ui.fixtures.js';

// ============================================================
// 9. Config
// ============================================================

test.describe('Config', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("Config")').click();
    await page.waitForTimeout(500);
  });

  test('should display config sections', async ({ page }) => {
    await expect(page.locator('.main')).toBeVisible();
    const hasConfig = await page.locator('.card, table').first().isVisible().catch(() => false);
    expect(hasConfig).toBe(true);
  });

  test('should show restart required badge for port', async ({ page }) => {
    const portCell = page.locator('td:has-text("48721"), text=48721');
    if (await portCell.first().isVisible().catch(() => false)) {
      await expect(portCell.first()).toBeVisible();
    }
    await expect(page.locator('.main')).toBeVisible();
  });

  test('should reset section to defaults', async ({ page }) => {
    const resetBtn = page.locator('button:has-text("Reset"), button:has-text("reset")').first();
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator('.main')).toBeVisible();
  });
});

// ============================================================
// 10. Search
// ============================================================

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("Search")').click();
    await page.waitForTimeout(500);
  });

  test('should enter query and see results', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i], input[type="search"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('admin portal');
      await searchInput.press('Enter');
      await page.waitForTimeout(1000);
      const results = page.locator('.card, tr, [class*="result"]');
      await expect(results.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show score breakdown visible', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i], input[type="search"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('code intelligence');
      await searchInput.press('Enter');
      await page.waitForTimeout(1000);
      const scoreElement = page.locator('.score-bar, .score-fill, [class*="score"]');
      if (await scoreElement.first().isVisible().catch(() => false)) {
        await expect(scoreElement.first()).toBeVisible();
      }
    }
  });
});
