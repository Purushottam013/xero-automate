'use strict';

module.exports = {
  root: true,

  env: {
    browser: true, // window, document, fetch, etc.
    es2022: true,  // Promise, Map, optional chaining, etc.
    node: true,    // process — needed for setupProxy.js
  },

  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true, // enable JSX parsing without Babel
    },
  },

  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    // react-hooks/recommended is intentionally NOT extended here:
    // v7 bundles React Compiler rules (rules-of-hooks, static-components, purity, etc.)
    // that only apply when the React Compiler is explicitly enabled in the build.
    // This project uses CRA without the React Compiler, so we enable only the
    // two classic hooks rules manually in the `rules` section below.
    'plugin:jsx-a11y/recommended',
  ],

  plugins: ['react', 'react-hooks', 'jsx-a11y'],

  settings: {
    react: {
      version: 'detect', // auto-detect installed React version
    },
  },

  rules: {
    // ── React ─────────────────────────────────────────────────────────────────
    // React 17+ transforms JSX automatically — no 'import React' needed
    'react/react-in-jsx-scope': 'off',

    // PropTypes are not used in this project (no TypeScript either)
    'react/prop-types': 'off',

    // forwardRef/memo components often lack display names in single-file apps
    'react/display-name': 'off',

    // Apostrophes in contractions ("you've", "it's") are valid JSX — the rule
    // exists to catch accidental malformed JSX, not to police natural language.
    'react/no-unescaped-entities': 'off',

    // ── Hooks ─────────────────────────────────────────────────────────────────
    // Classic hooks rules — enabled individually (see note on extends above)
    'react-hooks/rules-of-hooks': 'error',
    // Exhaustive-deps is warn, not error — intentional mount-only effects with
    // empty [] dependency arrays are a legitimate and common pattern here.
    'react-hooks/exhaustive-deps': 'warn',

    // ── Accessibility (jsx-a11y) ───────────────────────────────────────────────
    // Warn rather than error for a11y issues — they are real problems but
    // fixing them all at once across a large existing UI is a dedicated task.
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/no-noninteractive-element-interactions': 'warn',
    'jsx-a11y/no-noninteractive-tabindex': 'warn',
    // Interactive elements that use <div> instead of native controls
    'jsx-a11y/interactive-supports-focus': 'warn',
    // <label> elements without associated controls — warn, not error, while the
    // large existing UI is incrementally made fully accessible.
    'jsx-a11y/label-has-associated-control': 'warn',

    // ── Code quality ──────────────────────────────────────────────────────────
    // Warn (not error) on unused vars to allow incremental cleanup
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // The onComplete handler uses try{}catch{} to fire-and-forget the /complete API call
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
};
