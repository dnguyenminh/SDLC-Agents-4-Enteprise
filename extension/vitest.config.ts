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
    // lines/functions/branches/statements. `include` is scoped to the gated
    // modules ONLY so the thresholds never punish the pre-existing suite.
    // SA4E-358 adds OriginGate.ts to the same scoped gate (STP v1.1 §2.5 UT
    // exit: OriginGate.ts >= 95% — TDD §11.8 target, N-7-standard 4 metrics).
    // Requires @vitest/coverage-v8 (devDependency, pinned 4.1.8 == vitest).
    // Run: npm run test:coverage. The CI steps run --coverage only after the
    // gated module lands (356: C1 PathResolver / 358: C1 OriginGate), so this
    // config is inert until then. `perFile: true` keeps each gated module
    // individually >= 95% (a global aggregate would let a low file hide
    // behind a high one now that TWO files are gated; with a single file
    // global == per-file, so SA4E-356 semantics are unchanged).
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/services/PathResolver.ts", "src/services/OriginGate.ts"],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
        perFile: true,
      },
    },
  },
});
