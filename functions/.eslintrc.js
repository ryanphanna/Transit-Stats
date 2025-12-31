module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  extends: ['eslint:recommended', 'google'],
  rules: {
    'no-restricted-globals': ['error', 'name', 'length'],
    'prefer-arrow-callback': 'error',
    'quotes': ['error', 'single', { allowTemplateLiterals: true }],
    'max-len': ['error', { code: 120 }],
    'require-jsdoc': 'off',
    'valid-jsdoc': 'off',
    'indent': ['error', 2],
    'object-curly-spacing': ['error', 'always'],
  },
  overrides: [
    {
      files: ['**/*.spec.*'],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
