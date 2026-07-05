import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["src/anthropic/__tests__/handlers.test.ts"],
    globals: false,
    environment: "node",
  },
});
