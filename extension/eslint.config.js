import tseslint from 'typescript-eslint';

// SA4E-332 US-04 — langgraph/ tree fully deleted (SA4E-289 decommission).
// Guard: the legacy tree must never be re-imported — shared kernel lives in extension/src/mcp/.
const langgraphFreezePatterns = [
  // Covers: ../langgraph/*, ./langgraph/*, src/langgraph/*, @/langgraph, deep core|providers|vscode/*.
  { group: ['**/langgraph/**', '**/langgraph'], message: 'SA4E-332: langgraph/ is DELETED — import from extension/src/mcp/... instead.' },
  { group: ['**/langgraph/**.js', '**/langgraph.js'], message: 'SA4E-332: langgraph/ is DELETED (covers .js-suffixed imports like mcp-bridge.js) — import from extension/src/mcp/... instead.' },
];

export default tseslint.config(
  // 'src/test/' = vendored svelte compiler shim, 'src/mcp/devtools/' = vendored
  // chrome-devtools-mcp fork (incl. third_party/) — exempt from source standards.
  { ignores: ['out/', 'node_modules/', 'resources/', 'mcp-server/', 'dist/', '*.vsix', '**/*.js', 'src/test/', 'src/mcp/devtools/'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // BR-18 (SA4E-223): file size standard — max 200 lines.
      // 'warn' for legacy visibility; hard gate = scripts/check-line-count.sh
      // (changed-files-only, error) wired into CI + pre-commit.
      'max-lines': ['warn', { max: 200, skipBlankLines: false, skipComments: false }],
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
  // OPEN-03: tests ARE gated (no blanket __tests__ ignore above).
  { files: ['src/**/__tests__/**/*.ts', 'tests/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: langgraphFreezePatterns }] } },
);
