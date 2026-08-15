const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es6,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-restricted-globals': ['error', 'name', 'length'],
      'prefer-arrow-callback': 'error',
      'quotes': ['error', 'single', { allowTemplateLiterals: true }],
      // Existing data/prompt-heavy Functions contain long literals. Keep the
      // check visible without preventing the rest of the lint suite from running.
      'max-len': ['warn', { code: 120 }],
      'indent': ['error', 2],
      'object-curly-spacing': ['error', 'always'],
    },
  },
  {
    files: ['**/*.spec.*'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
  },
];
