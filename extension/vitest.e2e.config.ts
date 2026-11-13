import { defineConfig } from "vitest/config";
import * as path from "path";

// Dedicated config for `npm run test:e2e`.
// The default vitest.config.ts hard-excludes the two E2E files so they don't
// run during the normal unit suite; this config re-includes them.
export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "src/test/mocks/vscode.ts"),
    },
  },
  test: {
    include: [
      "src/__tests__/cross-process.e2e.test.ts",
      "src/__tests__/drawio-convert.e2e.test.ts",
    ],
    exclude: [
      "src/anthropic/__tests__/handlers.test.ts",
      "src/langgraph/__tests__/chat-workspace-review-real-llm.test.ts",
    ],
    globals: false,
    environment: "node",
    environmentMatchGlobs: [["**/webview/**", "jsdom"]],
    // E2E tests fork heavy backend processes; run files sequentially.
    fileParallelism: false,
    retry: 2,
  },
});
