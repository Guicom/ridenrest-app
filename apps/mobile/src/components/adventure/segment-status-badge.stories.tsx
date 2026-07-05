import type { Meta, StoryObj } from '@storybook/react';
import { View } from 'react-native';

import { SegmentStatusBadge } from './segment-status-badge';

const meta = {
  title: 'Adventure/SegmentStatusBadge',
  component: SegmentStatusBadge,
} satisfies Meta<typeof SegmentStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { status: 'pending' },
  render: () => (
    <View style={{ gap: 8, alignItems: 'flex-start' }}>
      <SegmentStatusBadge status="pending" />
      <SegmentStatusBadge status="processing" />
      <SegmentStatusBadge status="done" />
      <SegmentStatusBadge status="error" />
    </View>
  ),
};

export const Pending: Story = { args: { status: 'pending' } };
export const Processing: Story = { args: { status: 'processing' } };
export const Done: Story = { args: { status: 'done' } };
export const ErrorState: Story = { args: { status: 'error' } };
