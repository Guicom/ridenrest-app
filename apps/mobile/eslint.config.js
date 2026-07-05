// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Artefacts de build ignorés (alignés sur .gitignore) : `storybook-static`
    // est généré par `build-storybook` et ne doit jamais être linté.
    ignores: ['dist/*', '.expo/*', 'storybook-static/**'],
  },
  {
    // Mocks Jest en JavaScript : `no-undef` est actif pour les `.js` (désactivé
    // pour le TS, géré par tsc) → on déclare le global `jest` qu'ils utilisent.
    files: ['__mocks__/**/*.js'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
]);
