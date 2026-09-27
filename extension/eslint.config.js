import tseslint from 'typescript-eslint';

// SA4E-332 US-04 — freeze langgraph/: Pi/shared-kernel code must not import the legacy tree.
// Intra-legacy imports (files UNDER src/langgraph/) stay allowed until phased deletion (SA4E-289 follow-ups).
const langgraphFreezePatterns = [
  // Covers: ../langgraph/*, ./langgraph/*, src/langgraph/*, @/langgraph, deep core|providers|vscode/*.
  { group: ['**/langgraph/**', '**/langgraph'], message: 'SA4E-332: langgraph/ is FROZEN — import from extension/src/mcp/... instead (see extension/src/langgraph/README.md).' },
  { group: ['**/langgraph/**.js', '**/langgraph.js'], message: 'SA4E-332: langgraph/ is FROZEN (covers .js-suffixed imports like mcp-bridge.js) — import from extension/src/mcp/... instead.' },
];

export default tseslint.config(
  { ignores: ['out/', 'node_modules/', 'resources/', 'mcp-server/', 'dist/', '*.vsix', '**/*.js'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Relaxed: codebase not lint-clean yet — only critical rules as errors
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-console': 'off',
      'no-restricted-imports': ['error', { patterns: langgraphFreezePatterns }],
    },
  },
  // Option B (BR-32): intra-legacy imports stay lint-clean until phased deletion.
  { files: ['src/langgraph/**/*.ts'], rules: { 'no-restricted-imports': 'off' } },
  // SA4E-332 scope-narrow (SM decision 2026-09-27): Workflow Graph UI panel yielded to
  // SA4E-289 decommission (merge-first). panels/workflow-panel.ts keeps its legacy
  // ../langgraph/workflow/workflow-graph-data import until SA4E-289 deletes both files.
  // Temporary allowlist — DO NOT extend; all other panels import from src/mcp/...
  { files: ['src/panels/workflow-panel.ts'], rules: { 'no-restricted-imports': 'off' } },
  // OPEN-03: tests ARE gated (no blanket __tests__ ignore above).
  { files: ['src/**/__tests__/**/*.ts', 'tests/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: langgraphFreezePatterns }] } },
);
