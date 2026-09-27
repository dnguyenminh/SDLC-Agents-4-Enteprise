import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    passWithNoTests: true,
    setupFiles: ['./tests/vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'tests/e2e/**',
      // node:test files (KSA-154..157, parser suites): NOT vitest tests — vitest
      // cannot manage their lifecycle (vacuous pass on Windows, flaky node:test
      // runner race on Linux). Run via `node --test` separately (follow-up).
      'src/engine/graph/__tests__/graph-services.test.ts',
      'src/engine/parsers/languages/__tests__/apex-parser.test.ts',
      'src/engine/parsers/languages/__tests__/go-parser.test.ts',
      'src/engine/parsers/languages/__tests__/java-parser.test.ts',
      'src/engine/parsers/languages/__tests__/lwc-js-fields.test.ts',
      'src/engine/parsers/languages/__tests__/python-parser.test.ts',
      'src/engine/parsers/languages/__tests__/rust-parser.test.ts',
      'src/engine/indexer/__tests__/tree-sitter-pipeline.test.ts',
      'src/engine/parsers/languages/__tests__/salesforce-meta-parser.test.ts',
      'src/engine/parsers/languages/__tests__/salesforce-meta-parser.part2.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/**'],
    },
  },
});
