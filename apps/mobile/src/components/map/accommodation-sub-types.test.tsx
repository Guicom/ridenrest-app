import type { Poi } from '@ridenrest/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  AccommodationSubTypes,
  computeAccCountByType,
} from '@/components/map/accommodation-sub-types';
import { i18n } from '@/lib/i18n';
import { useMapStore } from '@/lib/stores/map.store';

// Sous-types hébergement — port iso web. `computeAccCountByType` pur + interaction de
// toggle (écrit `useMapStore`). Store global → reset entre les tests.

const initial = useMapStore.getState();
beforeEach(() => {
  useMapStore.setState(
    { ...initial, activeAccommodationTypes: new Set(['hotel']) },
    true,
  );
});

function makePoi(category: Poi['category']): Poi {
  return {
    id: `${category}-${Math.round(category.length)}`,
    externalId: 'x',
    source: 'google',
    category,
    name: category,
    lat: 45,
    lng: 5,
    distFromTraceM: 0,
    distAlongRouteKm: 1,
  } as Poi;
}

describe('computeAccCountByType (pur)', () => {
  it('renvoie null sans données', () => {
    expect(computeAccCountByType(undefined)).toBeNull();
    expect(computeAccCountByType([])).toBeNull();
  });

  it('compte par catégorie', () => {
    const counts = computeAccCountByType([
      makePoi('hotel'),
      makePoi('hotel'),
      makePoi('camp_site'),
    ]);
    expect(counts).toEqual({ hotel: 2, camp_site: 1 });
  });
});

describe('AccommodationSubTypes', () => {
  it('affiche le compteur par type (parité web)', async () => {
    await render(
      <AccommodationSubTypes
        accommodationPois={[makePoi('hotel'), makePoi('hotel')]}
      />,
    );
    expect(
      screen.getByText(`${i18n.t('pois.category.hotel')} (2)`),
    ).toBeOnTheScreen();
  });

  it('tap un sous-type → bascule activeAccommodationTypes', async () => {
    await render(<AccommodationSubTypes />);
    fireEvent.press(screen.getByText(i18n.t('pois.category.camp_site')));
    expect(
      useMapStore.getState().activeAccommodationTypes.has('camp_site'),
    ).toBe(true);
  });
});
