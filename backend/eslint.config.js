import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const sharedRules = {
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-floating-promises': 'warn',
  'no-console': ['warn', { allow: ['warn', 'error'] }],
};

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.code-intel/', '*.bak', 'minimal.js', 'test-*.ts', 'src/viewer/', 'src/modules/pega/expression/generated/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    ignores: ['**/__tests__/**'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },
  {
    files: ['**/__tests__/**'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: { ...sharedRules, '@typescript-eslint/no-floating-promises': 'off' },
  }
);