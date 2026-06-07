import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { Skeleton } from './skeleton';

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Skeleton className="h-6 w-40" />,
};

export const CardPlaceholder: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
    </View>
  ),
};
