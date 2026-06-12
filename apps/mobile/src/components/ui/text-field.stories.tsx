import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { ErrorBanner } from './error-banner';
import { TextField } from './text-field';

const meta = {
  title: 'UI/TextField',
  component: TextField,
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Email',
    placeholder: 'votre@email.com',
    keyboardType: 'email-address',
    autoCapitalize: 'none',
  },
};

export const WithError: Story = {
  args: {
    label: 'Mot de passe',
    placeholder: '••••••••',
    secureTextEntry: true,
    error: 'Mot de passe : 8 caractères minimum',
  },
};

export const WithBanner: Story = {
  args: { label: 'Email' },
  render: () => (
    <View className="gap-4">
      <TextField label="Email" placeholder="votre@email.com" />
      <ErrorBanner message="Email ou mot de passe incorrect" />
    </View>
  ),
};
