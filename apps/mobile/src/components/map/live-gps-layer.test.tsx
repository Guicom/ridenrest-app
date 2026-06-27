import { render, screen } from '@testing-library/react-native';

import {
  buildGpsFeatureCollection,
  LiveGpsLayer,
} from '@/components/map/live-gps-layer';
import { useLiveStore } from '@/lib/stores/live.store';

// Point GPS Live (MOB-5.2 / T5, AC5). `@maplibre/maplibre-react-native` mocké globalement
// (GeoJSONSource/Layer = Views identifiées par `testID = id`). Le `data` n'étant pas
// forwardé par le mock, la logique de construction est testée via `buildGpsFeatureCollection`.

const initialStore = useLiveStore.getState();

beforeEach(() => {
  useLiveStore.setState({ ...initialStore }, true);
});

describe('buildGpsFeatureCollection', () => {
  it('position valide → 1 feature Point en [lng, lat]', () => {
    const fc = buildGpsFeatureCollection({ lat: 45.1, lng: 5.2 });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.coordinates).toEqual([5.2, 45.1]);
  });

  it('position null → collection vide (source vidée, GPS perdu)', () => {
    expect(buildGpsFeatureCollection(null).features).toHaveLength(0);
  });

  it('coordonnée non finie → collection vide (anti-SIGABRT)', () => {
    expect(
      buildGpsFeatureCollection({ lat: NaN, lng: 5 }).features,
    ).toHaveLength(0);
    expect(
      buildGpsFeatureCollection({ lat: 45, lng: Infinity }).features,
    ).toHaveLength(0);
  });
});

describe('<LiveGpsLayer />', () => {
  it('rend la source GPS + les calques dot/halo', async () => {
    useLiveStore.setState({ currentPosition: { lat: 45, lng: 5 } });
    await render(<LiveGpsLayer />);
    expect(screen.getByTestId('gps-position')).toBeTruthy();
    expect(screen.getByTestId('gps-halo')).toBeTruthy();
    expect(screen.getByTestId('gps-dot')).toBeTruthy();
  });

  it('rend même sans position (source montée mais vide)', async () => {
    useLiveStore.setState({ currentPosition: null });
    await render(<LiveGpsLayer />);
    expect(screen.getByTestId('gps-position')).toBeTruthy();
  });
});
