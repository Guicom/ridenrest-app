import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { label: 'Planifier' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'],
    },
    size: { control: 'select', options: ['default', 'sm', 'lg', 'icon'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Large: Story = {
  // Cible tactile ≥ 44×44 px (NFR-LP-003).
  args: { size: 'lg', label: 'Démarrer le Live' },
};

export const Variants: Story = {
  render: (args) => (
    <View style={{ gap: 12 }}>
      <Button {...args} variant="default" label="Default" />
      <Button {...args} variant="outline" label="Outline" />
      <Button {...args} variant="secondary" label="Secondary" />
      <Button {...args} variant="ghost" label="Ghost" />
      <Button {...args} variant="destructive" label="Destructive" />
      <Button {...args} variant="link" label="Link" />
    </View>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, label: 'Indisponible' },
};
