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
    exclude: ['node_modules', 'dist', 'tests/e2e/admin-ui.e2e.test.ts', 'tests/e2e/lod-collapse.e2e.test.ts'],
  },
});
