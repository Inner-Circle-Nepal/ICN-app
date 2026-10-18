// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    /*
     * Tests drive hooks from outside a real component tree on purpose: a
     * probe component assigns the hook result to a module-scoped variable so
     * the test can call it, and `vi.mock` factories must be hoisted above the
     * imports they replace. Both are deliberate test mechanics, not app code
     * patterns, so the rules that police them are off here only.
     */
    files: ['tests/**'],
    rules: {
      'react-hooks/globals': 'off',
      'import/first': 'off',
    },
  },
]);
