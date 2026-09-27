import tseslint from 'typescript-eslint';

// SA4E-332 US-04 — langgraph/ tree fully deleted (SA4E-289 decommission).
// Guard: the legacy tree must never be re-imported — shared kernel lives in extension/src/mcp/.
const langgraphFreezePatterns = [
  // Covers: ../langgraph/*, ./langgraph/*, src/langgraph/*, @/langgraph, deep core|providers|vscode/*.
  { group: ['**/langgraph/**', '**/langgraph'], message: 'SA4E-332: langgraph/ is DELETED — import from extension/src/mcp/... instead.' },
  { group: ['**/langgraph/**.js', '**/langgraph.js'], message: 'SA4E-332: langgraph/ is DELETED (covers .js-suffixed imports like mcp-bridge.js) — import from extension/src/mcp/... instead.' },
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
  // OPEN-03: tests ARE gated (no blanket __tests__ ignore above).
  { files: ['src/**/__tests__/**/*.ts', 'tests/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: langgraphFreezePatterns }] } },
);
