import type { AdventureResponse } from '@ridenrest/shared';
import type { Meta, StoryObj } from '@storybook/react';

import { AdventureCard } from './adventure-card';

// Mock minimal d'AdventureResponse — seuls les champs lus par la carte importent
// (id, name, totalDistanceKm, startDate) ; le reste remplit le contrat de type.
const baseAdventure: AdventureResponse = {
  id: 'adv-1',
  userId: 'user-1',
  name: 'Tour du Mont-Blanc',
  totalDistanceKm: 170.4,
  totalElevationGainM: 11000,
  totalElevationLossM: 11000,
  startDate: null,
  endDate: null,
  status: 'planning',
  densityStatus: 'idle',
  densityProgress: 0,
  avgSpeedKmh: 15,
  routingProfile: 'gravel',
  hasStravaSegment: false,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

const meta = {
  title: 'Adventure/AdventureCard',
  component: AdventureCard,
  args: {
    onPress: () => {},
  },
} satisfies Meta<typeof AdventureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { adventure: baseAdventure },
};

export const NoDistance: Story = {
  args: { adventure: { ...baseAdventure, name: 'Nouvelle aventure', totalDistanceKm: 0 } },
};

export const LongName: Story = {
  args: {
    adventure: {
      ...baseAdventure,
      name: 'Traversée intégrale des Pyrénées du Cap de Creus à Hendaye en VTT gravel',
    },
  },
};

export const WithDatesAndStrava: Story = {
  args: {
    adventure: {
      ...baseAdventure,
      name: 'DB 2025',
      totalDistanceKm: 1367.6,
      totalElevationGainM: 16041,
      totalElevationLossM: 16105,
      startDate: '2026-04-20',
      endDate: '2026-06-25',
      hasStravaSegment: true,
    },
  },
};
