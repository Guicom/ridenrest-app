import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { trackBookingClick } from '@ridenrest/analytics';
import type { Poi } from '@ridenrest/shared';

import { BookingLinks } from '@/components/shared/booking-links';
import { openExternalUrl } from '@/lib/external-links';

// MOB-4.5 / T6 — bloc deep links réservation (slot fiche hébergement). Au press :
// `trackBookingClick` (non bloquant) PUIS `openExternalUrl`. Analytics + ouverture
// mockés ; les builders d'URL restent réels (on vérifie les URLs exactes, parité web).

jest.mock('@ridenrest/analytics', () => ({
  trackBookingClick: jest.fn(),
}));

jest.mock('@/lib/external-links', () => {
  const actual = jest.requireActual('@/lib/external-links');
  return { ...actual, openExternalUrl: jest.fn() };
});

const mockTrack = trackBookingClick as jest.Mock;
const mockOpen = openExternalUrl as jest.Mock;

function makePoi(over: Partial<Poi> = {}): Poi {
  return {
    id: 'p1',
    externalId: 'ext1',
    source: 'google',
    category: 'hotel',
    name: 'Hôtel du Col',
    lat: 45.9,
    lng: 6.8,
    distFromTraceM: 120,
    distAlongRouteKm: 42.3,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOpen.mockResolvedValue({ ok: true });
});

/**
 * Ouvre la dropdown « Rechercher sur » (CTA unique, parité web) puis attend que les
 * entrées soient montées. (`fireEvent.press` déclenche `onPress` de suite, mais le
 * re-render piloté par l'état est différé sous React 19 → on attend les items.)
 */
async function openDropdown() {
  fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com ou Airbnb'));
  await screen.findByLabelText('Rechercher sur Booking.com');
}

describe('BookingLinks', () => {
  it('CTA unique « Rechercher sur » ; entrées masquées tant que la dropdown est fermée', async () => {
    await render(<BookingLinks poi={makePoi()} city="Chamonix" userTier="free" />);
    expect(screen.getByText('Rechercher sur')).toBeOnTheScreen();
    // Pattern dropdown (parité web) : Booking/Airbnb pas rendus avant ouverture.
    expect(screen.queryByText('Booking.com')).toBeNull();
    expect(screen.queryByText('Airbnb')).toBeNull();
  });

  it('ouverture de la dropdown → Booking.com + Airbnb', async () => {
    await render(<BookingLinks poi={makePoi()} city="Chamonix" userTier="free" />);
    await openDropdown();
    expect(screen.getByText('Booking.com')).toBeOnTheScreen();
    expect(screen.getByText('Airbnb')).toBeOnTheScreen();
  });

  it('re-clic sur « Rechercher sur » → referme la dropdown (toggle)', async () => {
    await render(<BookingLinks poi={makePoi()} city="Chamonix" userTier="free" />);
    await openDropdown();
    expect(screen.getByText('Booking.com')).toBeOnTheScreen();
    // 2e press du CTA → fermeture (re-render différé sous React 19 → waitFor).
    fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com ou Airbnb'));
    await waitFor(() => expect(screen.queryByText('Booking.com')).toBeNull());
  });

  it('press Booking → track {source: booking.com, poi_type, page: map, tier} PUIS openExternalUrl (URL ville)', async () => {
    await render(<BookingLinks poi={makePoi()} city="Chamonix" userTier="pro" />);
    await openDropdown();
    fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com'));
    expect(mockTrack).toHaveBeenCalledWith({
      source: 'booking.com',
      poi_type: 'hotel',
      page: 'map',
      user_tier: 'pro',
    });
    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(
        'https://www.booking.com/searchresults.html?ss=Chamonix&dest_type=city&latitude=45.9&longitude=6.8',
      ),
    );
  });

  it('press Airbnb → track {source: airbnb} + openExternalUrl (bbox ±0.2°)', async () => {
    await render(<BookingLinks poi={makePoi()} city="Chamonix" userTier="free" />);
    await openDropdown();
    fireEvent.press(screen.getByLabelText('Rechercher sur Airbnb'));
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'airbnb', poi_type: 'hotel' }),
    );
    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(
        'https://www.airbnb.com/s/homes?ne_lat=46.1&ne_lng=7&sw_lat=45.699999999999996&sw_lng=6.6',
      ),
    );
  });

  it('sans ville → Booking en fallback coordonnées (latlong)', async () => {
    await render(<BookingLinks poi={makePoi()} city={null} userTier="anonymous" />);
    await openDropdown();
    fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com'));
    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(
        'https://www.booking.com/searchresults.html?latitude=45.9&longitude=6.8&dest_type=latlong',
      ),
    );
  });

  it('un échec du tracking n’empêche PAS l’ouverture du lien (AC3 non bloquant)', async () => {
    mockTrack.mockImplementationOnce(() => {
      throw new Error('analytics boom');
    });
    await render(<BookingLinks poi={makePoi()} city="Chamonix" userTier="free" />);
    await openDropdown();
    fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com'));
    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
  });

  it('échec d’ouverture → message i18n affiché (jamais de crash)', async () => {
    mockOpen.mockResolvedValue({ ok: false, error: new Error('no handler') });
    await render(<BookingLinks poi={makePoi()} city="Chamonix" userTier="free" />);
    await openDropdown();
    fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com'));
    expect(await screen.findByText("Impossible d'ouvrir le lien")).toBeOnTheScreen();
  });

  it('user_tier transmis tel quel (anonymous)', async () => {
    await render(<BookingLinks poi={makePoi()} city="Chamonix" userTier="anonymous" />);
    await openDropdown();
    fireEvent.press(screen.getByLabelText('Rechercher sur Airbnb'));
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({ user_tier: 'anonymous' }),
    );
  });
});
