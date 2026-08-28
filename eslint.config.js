const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'renderer/js/vendor/**'],
  },
  js.configs.recommended,

  // Shared style rules, kept as warnings so introducing the linter doesn't
  // suddenly block work on an existing codebase. Placed before the
  // file-specific blocks below so their more targeted rule overrides
  // (e.g. renderer's no-unused-vars scoping) win, per flat config's
  // later-wins-per-key cascade.
  {
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      eqeqeq: ['warn', 'smart'],
      quotes: ['warn', 'single', { avoidEscape: true }],
    },
  },

  // electron/ + scripts/ + .claude/hooks/ — Node-side code, CommonJS.
  {
    files: ['electron/**/*.js', 'scripts/**/*.js', '.claude/hooks/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // renderer/ — plain <script>-tag globals, NOT ES modules or a bundler.
  // View modules and shared helper files (utils.js, nutritionShared.js,
  // charts.js, app.js) all define and reference globals across files by
  // design — see CLAUDE.md. no-undef is off entirely for this reason, and
  // no-unused-vars is scoped to `local` so it still catches real unused
  // variables inside functions without flagging every top-level
  // function/const meant to be used as a cross-file global.
  {
    files: ['renderer/js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['warn', { vars: 'local', argsIgnorePattern: '^_' }],
    },
  },
];
