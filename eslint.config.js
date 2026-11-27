import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const nodeFiles = ['server/**', 'scripts/**', 'e2e/**', '*.config.js', '*.config.mjs'];

export default [
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  { ...jsxA11y.flatConfigs.recommended, files: ['src/**/*.{js,jsx}'] },
  {
    files: nodeFiles,
    languageOptions: { globals: globals.node },
  },
  // Baseline: rules that fail today are "warn"; `npm run lint` caps the total
  // (--max-warnings) so no new warning can land. Fix list: .usam-ops/reports/lint-baseline.md
  {
    rules: {
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-undef': 'warn',
      'no-control-regex': 'warn',
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    rules: {
      'react/prop-types': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },
];
