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
    projects: [
      {
        // Node environment for backend/unit tests
        test: {
          name: "node",
          include: ["src/**/__tests__/**/*.test.ts"],
          exclude: [
            "src/__tests__/cross-process.e2e.test.ts",
            "src/__tests__/drawio-convert.e2e.test.ts",
            "src/webview/**/__tests__/**/*.test.ts",
          ],
          globals: false,
          environment: "node",
          fileParallelism: false,
          retry: 2,
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
        resolve: {
          alias: {
            vscode: path.resolve(__dirname, "src/test/mocks/vscode.ts"),
            svelte: path.resolve(__dirname, "src/test/svelte-shim/runtime"),
            "svelte/compiler": path.resolve(__dirname, "src/test/svelte-shim/compiler"),
          },
        },
      },
      {
        // Node environment for SaveAllController (webview folder but no DOM needed)
        test: {
          name: "node-webview-utils",
          include: ["src/webview/__tests__/SaveAllController.test.ts"],
          globals: false,
          environment: "node",
          fileParallelism: false,
          retry: 2,
        },
        resolve: {
          alias: {
            vscode: path.resolve(__dirname, "src/test/mocks/vscode.ts"),
            svelte: path.resolve(__dirname, "src/test/svelte-shim/runtime"),
            "svelte/compiler": path.resolve(__dirname, "src/test/svelte-shim/compiler"),
          },
        },
      },
      {
        // JSDOM environment for webview tests
        test: {
          name: "webview",
          include: ["src/webview/**/__tests__/**/*.test.ts"],
          exclude: ["src/webview/__tests__/SaveAllController.test.ts"],
          globals: false,
          environment: "jsdom",
          fileParallelism: false,
          retry: 2,
        },
        resolve: {
          alias: {
            vscode: path.resolve(__dirname, "src/test/mocks/vscode.ts"),
            svelte: path.resolve(__dirname, "src/test/svelte-shim/runtime"),
            "svelte/compiler": path.resolve(__dirname, "src/test/svelte-shim/compiler"),
          },
        },
      },
    ],
  },
});
