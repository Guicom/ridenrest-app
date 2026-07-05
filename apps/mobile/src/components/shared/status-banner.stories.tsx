import type { Meta, StoryObj } from '@storybook/react';

import { StatusBanner } from './status-banner';

// `forceVisible` rend le bandeau indépendamment de la connectivité (en runtime il
// n'apparaît qu'offline, piloté par useNetworkStatus).
const meta = {
  title: 'Shared/StatusBanner',
  component: StatusBanner,
} satisfies Meta<typeof StatusBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Offline: Story = {
  args: { forceVisible: true },
};

export const CustomMessage: Story = {
  args: { forceVisible: true, message: 'Synchronisation en cours…' },
};
