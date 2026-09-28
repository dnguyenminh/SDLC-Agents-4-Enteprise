/**
 * Vitest config for E2E API tests.
 * Uses globalSetup to auto-start a server with an ISOLATED temp database.
 * Production .code-intel/ is NEVER touched.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    passWithNoTests: true,
    globalSetup: ['./tests/e2e/setup/global-setup.ts'],
    setupFiles: ['./tests/e2e/setup/env-setup.ts'],
    include: ['tests/e2e/**/*.e2e.test.ts'],
    // TEMPORARY: backend e2e files below fail due to missing server-bootstrap
    // features (admin seeding from ADMIN_INITIAL_PASSWORD, complexity table
    // creation in harness, port/config reporting mismatch). Re-enable after
    // those server fixes land.
    // Re-enabled 2026-09-23: admin-api.e2e (61/61), mcp-api + tool-forwarding
    // (51/51 — fixed SqliteAdapter sibling-divergence root cause),
    // multi-tenant.e2e (34/34), reindex.e2e (4/4 — wired ToolSearchService
    // in the in-process harness like production index.ts does).
    // NOTE: admin-ui + lod-collapse are @playwright/test suites (page
    // fixtures) — they can never run under Vitest. They need
    // `npx playwright install`, a playwright.config + a live server, so they
    // stay excluded here by design (wrong runner, not broken tests).
    exclude: [
      'node_modules',
      'dist',
      'tests/e2e/admin-ui.e2e.test.ts',
      'tests/e2e/lod-collapse.e2e.test.ts',
    ],
  },
});
