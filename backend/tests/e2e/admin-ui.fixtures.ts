/**
 * Shared fixtures for the Admin Portal Playwright UI suites.
 * (Split from admin-ui.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * SUFFIX NOTE: sibling files use `.ui.test.ts`, NOT `.e2e.test.ts`.
 * vitest.e2e.config.ts includes every ".e2e.test.ts" file under tests/e2e/
 * (recursive glob) and excludes only the ORIGINAL admin-ui filename by exact
 * path; Playwright suites can never run under Vitest (see that config's
 * comment), so a new ".e2e.test.ts" file would be collected by
 * `npm run test:e2e-api` and crash it. The ".ui.test.ts" suffix keeps vitest
 * e2e green while `npx playwright test` (default testMatch "*.test.ts") still
 * discovers every spec.
 */
import { type Page } from '@playwright/test';
import { ADMIN_URL, E2E_PASSWORD } from './setup/e2e-config.js';

// Admin credentials — sourced from env (vuln-0001: no hardcoded default).
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || E2E_PASSWORD;

// Helper: login and store token
export async function login(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(ADMIN_URL);
  await page.waitForSelector('.login-box', { timeout: 10000 });
  await page.fill('input[placeholder="Username"]', ADMIN_USERNAME);
  await page.fill('input[placeholder="Password"]', ADMIN_PASSWORD);
  await page.click('button:has-text("Login")');
  await page.waitForSelector('.nav-item', { timeout: 10000 });await page.waitForTimeout(1000);
}
