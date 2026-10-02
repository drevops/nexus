import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['assets/vendor/**', 'node_modules/**', '.logs/**', 'playwright-report/**', 'test-results/**', '_site/**'],
  },
  {
    files: ['assets/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['tests/**/*.{js,mjs}', 'eslint.config.js', 'playwright.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Callbacks passed to page.evaluate() run in the browser.
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig,
];
