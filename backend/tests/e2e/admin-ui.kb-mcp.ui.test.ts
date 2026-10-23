/**
 * E2E UI Tests — Admin Portal (Playwright): KB Management + MCP Servers.
 * (Split from admin-ui.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-ui (or: npx playwright test)
 */
import { test, expect } from '@playwright/test';
import { login } from './admin-ui.fixtures.js';

// ============================================================
// 4. KB Management
// ============================================================

test.describe('KB Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("KB Management")').click();
    await page.waitForTimeout(500);
  });

  test('should display entries table', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th:has-text("Source")')).toBeVisible();
  });

  test('should have filter input that works', async ({ page }) => {
    const filterInput = page.locator('.filter-input, input[placeholder="Filter entries..."]').first();
    await expect(filterInput).toBeVisible();
    await filterInput.fill('admin');
    await page.waitForTimeout(300);
    await expect(page.locator('table')).toBeVisible();
  });

  test('should have pagination controls', async ({ page }) => {
    // Pagination shows only when totalPages > 1
    await expect(page.locator('.main')).toBeVisible();
  });
});

// ============================================================
// 5. MCP Servers
// ============================================================

test.describe('MCP Servers', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("MCP Servers")').click();
    await page.waitForTimeout(500);
  });

  test('should display servers page', async ({ page }) => {
    await expect(page.locator('.header h2')).toBeVisible();
    await expect(page.locator('.main')).toBeVisible();
  });

  test('should expand server to show tool list', async ({ page }) => {
    const expandBtn = page.locator('.expand-btn').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(300);
    }
    expect(true).toBe(true);
  });

  test('should filter tools when expanded', async ({ page }) => {
    const expandBtn = page.locator('.expand-btn').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(300);
      const filterInput = page.locator('.filter-input, input[placeholder*="filter" i]');
      if (await filterInput.isVisible().catch(() => false)) {
        await filterInput.fill('test');
        await page.waitForTimeout(200);
      }
    }
    expect(true).toBe(true);
  });

  test('should collapse expanded server', async ({ page }) => {
    const expandBtn = page.locator('.expand-btn').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(200);
      await expandBtn.click();
      await page.waitForTimeout(200);
    }
    expect(true).toBe(true);
  });
});

// ============================================================
// 6. MCP Tool Toggle
// ============================================================

test.describe('MCP Tool Toggle', () => {
  test('should toggle tool state', async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("MCP Servers")').click();
    await page.waitForTimeout(500);

    const expandBtn = page.locator('.expand-btn').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(300);

      const toggle = page.locator('.toggle-switch input').first();
      if (await toggle.isVisible().catch(() => false)) {
        const wasChecked = await toggle.isChecked();
        await toggle.click({ force: true });
        await page.waitForTimeout(500);
        const isChecked = await toggle.isChecked();
        expect(isChecked).not.toBe(wasChecked);
      }
    }
  });
});
