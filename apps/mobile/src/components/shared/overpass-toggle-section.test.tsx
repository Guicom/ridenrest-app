import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OverpassToggleSection } from '@/components/shared/overpass-toggle-section';
import * as profileApi from '@/lib/api/profile';
import { i18n } from '@/lib/i18n';

jest.mock('@/lib/api/profile', () => ({
  getProfile: jest.fn(),
  updateOverpassEnabled: jest.fn(),
}));

const mockGet = profileApi.getProfile as jest.Mock;
const mockUpdate = profileApi.updateOverpassEnabled as jest.Mock;

async function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <OverpassToggleSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({ overpassEnabled: true, tier: 'free' });
});

describe('OverpassToggleSection', () => {
  it('reflète l’état du profil + titre (parité web)', async () => {
    mockGet.mockResolvedValue({ overpassEnabled: true, tier: 'free' });
    await setup();
    expect(
      screen.getByText(i18n.t('settings.overpass.title')),
    ).toBeOnTheScreen();
    await waitFor(() =>
      expect(
        screen.getByTestId('overpass-toggle').props.accessibilityState?.checked,
      ).toBe(true),
    );
  });

  it('toggle → PATCH du flag', async () => {
    mockGet.mockResolvedValue({ overpassEnabled: false, tier: 'free' });
    await setup();
    // Attendre que le profil soit chargé (le Switch est désactivé tant qu'undefined).
    await waitFor(() =>
      expect(
        screen.getByTestId('overpass-toggle').props.accessibilityState?.disabled,
      ).toBe(false),
    );
    fireEvent.press(screen.getByTestId('overpass-toggle'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(true));
  });
});
