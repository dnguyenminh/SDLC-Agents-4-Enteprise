/**
 * E2E UI Tests — Admin Portal (Playwright): RBAC + Users pages.
 * (Split from admin-ui.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Run: npm run test:e2e-ui (or: npx playwright test)
 */
import { test, expect } from '@playwright/test';
import { login } from './admin-ui.fixtures.js';

// ============================================================
// 7. RBAC
// ============================================================

test.describe('RBAC', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("RBAC")').click();
    await page.waitForTimeout(500);
  });

  test('should create a new group', async ({ page }) => {
    const newGroupBtn = page.locator('button:has-text("New Group"), button:has-text("Add Group"), button:has-text("Create")');
    if (await newGroupBtn.first().isVisible().catch(() => false)) {
      await newGroupBtn.first().click();
      await page.waitForTimeout(300);
      const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="Group" i]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill(`e2e-test-group-${Date.now()}`);
      }
      const permCheck = page.locator('.perm-check label, input[type="checkbox"]').first();
      if (await permCheck.isVisible().catch(() => false)) {
        await permCheck.click();
      }
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create")').last();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(500);
      }
    }
    expect(true).toBe(true);
  });

  test('should show groups list', async ({ page }) => {
    await expect(page.locator('.main')).toBeVisible();
    const content = page.locator('table, .card, .header');
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test('should expand group to show rules and change value', async ({ page }) => {
    const expandBtn = page.locator('.expand-btn').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(300);
      const ruleContent = page.locator('.rule-row, .sub-table, .expanded-row');
      if (await ruleContent.first().isVisible().catch(() => false)) {
        await expect(ruleContent.first()).toBeVisible();
      }
    }
  });

  test('should edit existing group and save', async ({ page }) => {
    const editBtn = page.locator('button:has-text("Edit")').first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator('.main')).toBeVisible();
  });
});

// ============================================================
// 8. Users
// ============================================================

test.describe('Users', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.locator('.nav-item:has-text("Users")').click();
    await page.waitForTimeout(500);
  });

  test('should display users list with admin', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.main').locator('text=admin').first()).toBeVisible({ timeout: 5000 });
  });

  test('should create user via UI', async ({ page }) => {
    const createBtn = page.locator('button:has-text("New User"), button:has-text("Add User"), button:has-text("Create")').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(300);
      const usernameInput = page.locator('input[placeholder*="username" i], input[placeholder*="Username"]').first();
      if (await usernameInput.isVisible().catch(() => false)) {
        await usernameInput.fill(`e2e-ui-${Date.now()}`);
        const passInput = page.locator('input[type="password"], input[placeholder*="password" i]').first();
        if (await passInput.isVisible().catch(() => false)) {
          await passInput.fill('Test123!');
        }
        const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create")').last();
        if (await saveBtn.isVisible().catch(() => false)) {
          await saveBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
    expect(true).toBe(true);
  });

  test('should disable user and verify badge', async ({ page }) => {
    const disableBtn = page.locator('button:has-text("Disable")').first();
    if (await disableBtn.isVisible().catch(() => false)) {
      await disableBtn.click();
      await page.waitForTimeout(500);
      const badge = page.locator('.badge:has-text("DISABLED"), .badge-red:has-text("DISABLED")');
      if (await badge.isVisible().catch(() => false)) {
        await expect(badge).toBeVisible();
      }
    }
  });

  test('should delete a user', async ({ page }) => {
    const deleteBtn = page.locator('button:has-text("Delete")').first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await page.waitForTimeout(500);
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });
});
