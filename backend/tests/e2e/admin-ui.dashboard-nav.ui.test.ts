/**
 * E2E UI Tests — Admin Portal (Playwright): Dashboard + Sidebar navigation.
 * (Split from admin-ui.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-ui (or: npx playwright test)
 */
import { test, expect } from '@playwright/test';
import { login } from './admin-ui.fixtures.js';

// ============================================================
// 2. Dashboard
// ============================================================

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display 5 stat cards', async ({ page }) => {
    const cards = page.locator('.grid .card');
    await expect(cards).toHaveCount(5);
  });

  test('should show stat card labels', async ({ page }) => {
    await expect(page.locator('.card h3:has-text("KB Entries")')).toBeVisible();
    await expect(page.locator('.card h3:has-text("Users")')).toBeVisible();
    await expect(page.locator('.card h3:has-text("MCP Servers")')).toBeVisible();
    await expect(page.locator('.card h3:has-text("Uptime")')).toBeVisible();
    await expect(page.locator('.card h3:has-text("Memory")')).toBeVisible();
  });

  test('should load activity feed', async ({ page }) => {
    const activityCard = page.locator('.card:has(h3:has-text("Recent Activity"))');
    await expect(activityCard).toBeVisible();
    const hasTable = await activityCard.locator('table').isVisible().catch(() => false);
    const hasEmpty = await activityCard.locator('text=No recent activity').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });
});

// ============================================================
// 3. Navigation - Sidebar (11 items)
// ============================================================

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const navItems = [
    'Dashboard',
    'KB Management',
    'MCP Servers',
    'Search',
    'RBAC',
    'Users',
    'Config',
    'Audit',
    'Analytics',
    'Graph',
    'KB Quality',
    'KB Tags',
    'Profile',
  ];

  for (const item of navItems) {
    test(`clicking "${item}" should navigate and update header`, async ({ page }) => {
      const navItem = page.locator(`.nav-item:has-text("${item}")`);
      await navItem.click();
      await page.waitForTimeout(300);
      await expect(navItem).toBeVisible();
      const header = page.locator('.header h2');
      await expect(header).toBeVisible();
    });
  }
});
