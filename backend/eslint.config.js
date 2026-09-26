import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const sharedRules = {
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': 'off',
  '@typescript-eslint/no-floating-promises': 'off',
  'no-console': 'off',
  'no-useless-escape': 'off',
  'no-useless-assignment': 'off',
  'no-case-declarations': 'off',
  '@typescript-eslint/no-require-imports': 'off',
  // Intentional swallow-and-fallback catch blocks (e.g. optional env file read)
  // are allowed; empty if/for/function bodies still error.
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.code-intel/', '*.bak', 'minimal.js', 'test-*.ts', 'src/viewer/', 'src/admin/', 'src/modules/pega/expression/generated/', 'src/modules/pega/expression/pega-expr/generated/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // CommonJS migration scripts: `module`/`exports`/`require` are valid globals here.
    files: ['**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
  },
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