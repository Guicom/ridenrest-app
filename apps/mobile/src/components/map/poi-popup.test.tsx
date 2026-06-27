import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import type { CameraRef, MapRef } from '@maplibre/maplibre-react-native';
import type { GooglePlaceDetails, Poi } from '@ridenrest/shared';

import { trackBookingClick } from '@ridenrest/analytics';

import { PoiPopup } from '@/components/map/poi-popup';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { usePoiGoogleDetails, useReverseCity } from '@/hooks/use-pois';

// PoiPopup (MOB-4.2 refonte « liquid glass »). Fiche flottante ancrée au pin (`Marker`),
// fond verre (BlurView), enrichissement non bloquant + actions (Linking/Clipboard).
// MapLibre/BlurView/Clipboard mockés globalement (jest.setup). On mocke les hooks
// d'enrichissement + le réseau pour piloter les données sans HTTP.

jest.mock('@/hooks/use-network-status', () => ({
  useNetworkStatus: jest.fn(() => ({ isOnline: true })),
}));
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}));
jest.mock('@/hooks/use-pois', () => ({
  usePoiGoogleDetails: jest.fn(),
  useReverseCity: jest.fn(),
}));
// Session/profil → tier de l'analytics booking (MOB-4.5). Mockés pour éviter
// QueryClient/Better Auth réels dans ce test de composant.
jest.mock('@/lib/auth/client', () => ({
  useSession: jest.fn(() => ({ data: { user: { id: 'u1' } } })),
}));
jest.mock('@/hooks/use-profile', () => ({
  useProfile: jest.fn(() => ({ data: { overpassEnabled: false, tier: 'free' } })),
}));
// Analytics no-op safe — on vérifie l'émission au press du lien booking.
jest.mock('@ridenrest/analytics', () => ({
  trackBookingClick: jest.fn(),
}));

const mockGoogle = usePoiGoogleDetails as jest.Mock;
const mockReverse = useReverseCity as jest.Mock;

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

function makeDetails(over: Partial<GooglePlaceDetails> = {}): GooglePlaceDetails {
  return {
    placeId: 'pl1',
    displayName: null,
    formattedAddress: '12 rue du Mont, Chamonix',
    locality: null,
    postalCode: null,
    adminArea: null,
    country: null,
    lat: null,
    lng: null,
    rating: null,
    isOpenNow: null,
    weekdayDescriptions: [],
    periods: [],
    phone: '+33450000000',
    website: 'https://hotel.example',
    types: [],
    ...over,
  };
}

function makeCamera() {
  const easeTo = jest.fn();
  const getCamera = () => ({ easeTo } as unknown as CameraRef);
  return { easeTo, getCamera };
}

// Carte mockée avec projection : `getZoom`/`project`/`unproject` → le recentrage
// préserve le zoom courant (anti zoom-out) en le passant explicitement à `easeTo`.
function makeMap(zoom = 14) {
  const getZoom = jest.fn().mockResolvedValue(zoom);
  const project = jest.fn().mockResolvedValue([200, 400] as [number, number]);
  // unproject reçoit [x, y - OFFSET] → on renvoie un centre décalé reconnaissable.
  const unproject = jest
    .fn()
    .mockResolvedValue([7.0, 46.0] as [number, number]);
  const getMap = () => ({ getZoom, project, unproject } as unknown as MapRef);
  return { getZoom, project, unproject, getMap };
}

const mockNetwork = useNetworkStatus as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockNetwork.mockReturnValue({ isOnline: true });
  mockGoogle.mockReturnValue({ details: makeDetails(), isPending: false });
  mockReverse.mockReturnValue({
    city: 'Chamonix',
    postcode: null,
    state: null,
    country: null,
    isPending: false,
  });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('PoiPopup', () => {
  it('poi null → ne rend rien', async () => {
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={null} segmentId={null} onClose={jest.fn()} getCamera={getCamera} />,
    );
    expect(screen.queryByText('Hôtel du Col')).toBeNull();
  });

  it('poi sélectionné → fiche affichée (nom + catégorie)', async () => {
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi()} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    expect(screen.getByText('Hôtel du Col')).toBeOnTheScreen();
    expect(screen.getByText('Hôtel')).toBeOnTheScreen();
  });

  it('Marker id constant (anti « id cannot be changed » MapLibre)', async () => {
    const { getCamera } = makeCamera();
    // Le mock Marker dérive son testID de `props.id` → on vérifie l'id constant.
    await render(
      <PoiPopup
        poi={makePoi({ id: 'autre-poi' })}
        segmentId="s0"
        onClose={jest.fn()}
        getCamera={getCamera}
      />,
    );
    // id NON dérivé de poi.id (sinon ce serait 'poi-popup-autre-poi' → frozen-id crash).
    expect(screen.getByTestId('poi-popup')).toBeOnTheScreen();
    expect(screen.queryByTestId('poi-popup-autre-poi')).toBeNull();
  });

  it('recentrage caméra à l’ouverture (easeTo sur le POI, repli sans getMap)', async () => {
    const { easeTo, getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi()} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    await waitFor(() => expect(easeTo).toHaveBeenCalled());
    // Repli (pas de getMap) : centre = POI, et SURTOUT pas de `padding` (cause du zoom-out).
    expect(easeTo.mock.calls[0][0]).toMatchObject({ center: [6.8, 45.9] });
    expect(easeTo.mock.calls[0][0]).not.toHaveProperty('padding');
  });

  it('recentrage préserve le zoom courant (anti zoom-out, via projection)', async () => {
    const { easeTo, getCamera } = makeCamera();
    const { getZoom, project, unproject, getMap } = makeMap(14);
    await render(
      <PoiPopup
        poi={makePoi()}
        segmentId="s0"
        onClose={jest.fn()}
        getCamera={getCamera}
        getMap={getMap}
      />,
    );
    await waitFor(() => expect(easeTo).toHaveBeenCalled());
    expect(getZoom).toHaveBeenCalled();
    expect(project).toHaveBeenCalledWith([6.8, 45.9]);
    // Centre décalé via projection (unproject) + zoom passé EXPLICITEMENT → aucun zoom-out.
    expect(easeTo.mock.calls[0][0]).toMatchObject({ center: [7.0, 46.0], zoom: 14 });
    expect(easeTo.mock.calls[0][0]).not.toHaveProperty('padding');
    // L'offset vertical est retranché au pixel projeté du pin (pin en moitié basse).
    expect(unproject).toHaveBeenCalledWith([200, 250]);
  });

  it('Naviguer → ouvre l’itinéraire Maps (lat,lng)', async () => {
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi()} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    fireEvent.press(screen.getByLabelText('Naviguer vers Hôtel du Col'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringContaining('45.9,6.8'),
    );
  });

  it('Téléphone → compose tel:', async () => {
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi()} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    fireEvent.press(screen.getByLabelText('Appeler Hôtel du Col'));
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+33450000000');
  });

  it('Copier l’adresse → presse-papiers', async () => {
    const { getCamera } = makeCamera();
    const { unmount } = await render(
      <PoiPopup poi={makePoi()} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    fireEvent.press(screen.getByLabelText("Copier l'adresse"));
    expect(setStringAsync).toHaveBeenCalledWith('12 rue du Mont, Chamonix');
    // On attend le feedback (`then` → setAddressCopied) pour que la MAJ d'état + le
    // timer de reset soient posés DANS l'act (sinon update post-démontage + timer fuité).
    await screen.findByLabelText('Adresse copiée');
    // Démontage explicite → l'effet de cleanup annule le timer de feedback (anti-fuite).
    unmount();
  });

  it('Site officiel → ouvre le site web', async () => {
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi()} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    fireEvent.press(screen.getByLabelText('Site officiel'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://hotel.example');
  });

  it('croix → onClose', async () => {
    const onClose = jest.fn();
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi()} segmentId="s0" onClose={onClose} getCamera={getCamera} />,
    );
    fireEvent.press(screen.getByLabelText('Fermer la fiche'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hors-ligne → enrichissement désactivé (hooks appelés avec null) (AC5)', async () => {
    mockNetwork.mockReturnValue({ isOnline: false });
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi()} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    // Fiche de base toujours visible (offline, jamais bloquée).
    expect(screen.getByText('Hôtel du Col')).toBeOnTheScreen();
    // Enrichissement gaté : Google appelé avec externalId null (query disabled).
    expect(mockGoogle).toHaveBeenCalledWith(null, null);
  });

  it('hébergement → CTA booking présent ; entrées dans la dropdown (MOB-4.5 / AC1)', async () => {
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi({ category: 'hotel' })} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    // CTA unique « Rechercher sur » (parité web) — entrées masquées avant ouverture.
    expect(screen.getByText('Rechercher sur')).toBeOnTheScreen();
    expect(screen.queryByText('Booking.com')).toBeNull();
    // Ouverture de la dropdown → Booking + Airbnb (re-render différé).
    fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com ou Airbnb'));
    expect(await screen.findByText('Booking.com')).toBeOnTheScreen();
    expect(screen.getByText('Airbnb')).toBeOnTheScreen();
  });

  it('restaurant → AUCUN CTA booking (gate accommodations) (MOB-4.5 / AC1)', async () => {
    mockReverse.mockReturnValue({
      city: null,
      postcode: null,
      state: null,
      country: null,
      isPending: false,
    });
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi({ category: 'restaurant' })} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    expect(screen.queryByText('Rechercher sur')).toBeNull();
  });

  it('press Booking → trackBookingClick (poi_type=catégorie, page=map, tier) (MOB-4.5 / AC3)', async () => {
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi({ category: 'hotel' })} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com ou Airbnb'));
    fireEvent.press(
      await screen.findByLabelText('Rechercher sur Booking.com'),
    );
    expect(trackBookingClick).toHaveBeenCalledWith({
      source: 'booking.com',
      poi_type: 'hotel',
      page: 'map',
      user_tier: 'free',
    });
    // Ville résolue via reverseCity (Chamonix) → URL ville (parité ordre web).
    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringContaining('ss=Chamonix'),
    );
  });

  it('session null → userTier \'anonymous\' (AC3, chemin non connecté)', async () => {
    const { useSession: mockUseSession } = jest.requireMock('@/lib/auth/client') as {
      useSession: jest.Mock;
    };
    mockUseSession.mockReturnValueOnce({ data: null });
    const { getCamera } = makeCamera();
    await render(
      <PoiPopup poi={makePoi({ category: 'hotel' })} segmentId="s0" onClose={jest.fn()} getCamera={getCamera} />,
    );
    fireEvent.press(screen.getByLabelText('Rechercher sur Booking.com ou Airbnb'));
    fireEvent.press(await screen.findByLabelText('Rechercher sur Booking.com'));
    expect(trackBookingClick).toHaveBeenCalledWith(
      expect.objectContaining({ user_tier: 'anonymous' }),
    );
  });
});
