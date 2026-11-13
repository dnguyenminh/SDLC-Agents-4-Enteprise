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
    include: ["src/__tests__/drawio-convert.e2e.test.ts"],
    globals: false,
    environment: "node",
    fileParallelism: false,
    retry: 2,
    testTimeout: 180000,
  },
});