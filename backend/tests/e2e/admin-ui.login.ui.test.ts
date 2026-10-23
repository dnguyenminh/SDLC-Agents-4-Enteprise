/**
 * E2E UI Tests — Admin Portal (Playwright): Login page.
 * (Split from admin-ui.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-ui (or: npx playwright test)
 */
import { test, expect } from '@playwright/test';
import { ADMIN_URL } from './setup/e2e-config.js';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './admin-ui.fixtures.js';

// ============================================================
// 1. Login Page
// ============================================================

test.describe('Login', () => {
  test('should show login form', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await expect(page.locator('.login-box')).toBeVisible();
    await expect(page.locator('.login-box h2')).toHaveText('Admin Portal');
    await expect(page.locator('input[placeholder="Username"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Login")')).toBeVisible();
  });

  test('should login with correct credentials and redirect to dashboard', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.fill('input[placeholder="Username"]', ADMIN_USERNAME);
    await page.fill('input[placeholder="Password"]', ADMIN_PASSWORD);
    await page.click('button:has-text("Login")');
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show error message on wrong credentials', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.fill('input[placeholder="Username"]', 'admin');
    await page.fill('input[placeholder="Password"]', 'wrongpassword');
    await page.click('button:has-text("Login")');
    const errorDiv = page.locator('.login-box').locator('div', { hasText: 'Invalid credentials' });
    await expect(errorDiv).toBeVisible({ timeout: 10000 });
  });
});
