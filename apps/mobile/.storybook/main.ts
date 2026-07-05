import type { StorybookConfig } from '@storybook/react-native-web-vite'

/**
 * Storybook RN web v8 (MOB-1.3) — catalogue des primitifs `ui/`.
 * Cible web via `@storybook/react-native-web-vite`. NativeWind sur le web :
 *  - `pluginReactOptions.jsxImportSource: 'nativewind'` (className → styles),
 *  - `src/global.css` importé dans `preview.tsx`, traité par `postcss.config.js`
 *    (Tailwind v3 + design-tokens).
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {
      pluginReactOptions: {
        jsxImportSource: 'nativewind',
      },
    },
  },
}

export default config
