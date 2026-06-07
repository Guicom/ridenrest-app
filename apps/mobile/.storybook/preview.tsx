import '../src/global.css';

import type { Preview } from '@storybook/react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * Decorator de thème : enveloppe chaque story dans un scope `.dark` (NativeWind
 * `darkMode: 'class'`) selon la globale « theme » de la toolbar, sur une surface
 * `bg-background`. Light = `:root`, Dark = palette « Charbon » (mirorée du web).
 */
function ThemeFrame({ dark, children }: { dark: boolean; children: ReactNode }) {
  return (
    <View className={dark ? 'dark' : undefined}>
      <View className="bg-background p-6" style={{ minHeight: 240, gap: 16 }}>
        {children}
      </View>
    </View>
  );
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: 'Palette du design system',
      defaultValue: 'light',
      toolbar: {
        title: 'Thème',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark · Charbon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => (
      <ThemeFrame dark={context.globals.theme === 'dark'}>
        <Story />
      </ThemeFrame>
    ),
  ],
};

export default preview;
