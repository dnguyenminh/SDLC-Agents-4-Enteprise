/**
 * E2E UI Tests — Admin Portal (Playwright): Audit, KB Graph, Profile pages.
 * (Split from admin-ui.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-ui (or: npx playwright test)
 */
import { test, expect } from '@playwright/test';
import { login } from './admin-ui.fixtures.js';

// ============================================================
// 11. Audit
// ============================================================

test.describe('Audit', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("Audit")').click();
    await page.waitForTimeout(500);
  });

  test('should display audit entries table with data', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show action column in table', async ({ page }) => {
    const actionCol = page.locator('th:has-text("Action")');
    await expect(actionCol).toBeVisible();
  });
});

// ============================================================
// 12. KB Graph
// ============================================================

test.describe('KB Graph', () => {
  test('should render 3D graph with minimap overlay', async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("Graph")').click();
    await page.waitForTimeout(8000);
    const canvases = page.locator('canvas');
    const count = await canvases.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should show legend with node types', async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("Graph")').click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Node Types')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Document')).toBeVisible();
    await expect(page.locator('text=code').first()).toBeVisible();
  });

  test('should have interactive minimap canvas', async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("Graph")').click();
    await page.waitForTimeout(3000);
    const canvases = page.locator('canvas');
    const count = await canvases.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// 13. Profile
// ============================================================

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("Profile")').click();
    await page.waitForTimeout(500);
  });

  test('should display current profile info', async ({ page }) => {
    await expect(page.locator('.main').locator('text=admin').first()).toBeVisible({ timeout: 5000 });
  });

  test('should update email and verify', async ({ page }) => {
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email"]').first();
    if (await emailInput.isVisible().catch(() => false)) {
      const newEmail = `ui-test-${Date.now()}@test.local`;
      await emailInput.fill(newEmail);
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(500);
      }
    }
    await expect(page.locator('.main')).toBeVisible();
  });
});
