import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "src/test/mocks/vscode.ts"),
      svelte: path.resolve(__dirname, "src/test/svelte-shim/runtime"),
      "svelte/compiler": path.resolve(__dirname, "src/test/svelte-shim/compiler"),
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: [
      "src/anthropic/__tests__/handlers.test.ts",
      "src/__tests__/cross-process.e2e.test.ts",
      "src/__tests__/drawio-convert.e2e.test.ts",
    ],
    globals: false,
    environment: "node",
    // E2E tests fork heavy backend processes; run files sequentially to avoid
    // port/resource contention when multiple suites run in parallel.
    fileParallelism: false,
    // E2E tests depend on a real backend process booting up; allow a couple of
    // retries to absorb backend startup races without masking real failures.
    retry: 2,
    // SA4E-356 N-7 coverage gate (STP §2.5 exit): PathResolver.ts >= 95%
    // lines/functions/branches/statements. `include` is scoped to the new
    // module ONLY so the thresholds never punish the pre-existing suite.
    // Requires @vitest/coverage-v8 (devDependency). Run: npm run test:coverage.
    // The CI N-7 step runs --coverage only after services/PathResolver.ts
    // lands (TDD step C1), so this config is inert until then.
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/services/PathResolver.ts"],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
