import { render, screen } from '@testing-library/react-native';
import type { MapLayer, Poi } from '@ridenrest/shared';

import { PoiLayer, buildPoiFeatureCollection } from '@/components/map/poi-layer';

// PoiLayer (MOB-4.2 / AC2, T5). MapLibre mocké globalement : `GeoJSONSource`/`Layer`
// rendent une View `testID` dérivée de leur `id` → on cible les sources/calques par id.

function makePoi(id: string, category: Poi['category'], lat = 45, lng = 6): Poi {
  return {
    id,
    externalId: `ext-${id}`,
    source: 'overpass',
    category,
    name: `POI ${id}`,
    lat,
    lng,
    distFromTraceM: 100,
    distAlongRouteKm: 10,
  };
}

const EMPTY_BY_LAYER: Record<MapLayer, Poi[]> = {
  accommodations: [],
  restaurants: [],
  supplies: [],
  bike: [],
};

describe('buildPoiFeatureCollection (T5)', () => {
  it('produit des Point `[lng, lat]` (jamais `[lat, lng]`) avec props id/category', () => {
    const fc = buildPoiFeatureCollection([makePoi('1', 'hotel', 45.9, 6.8)]);
    expect(fc.features[0].geometry.coordinates).toEqual([6.8, 45.9]);
    expect(fc.features[0].properties).toMatchObject({ id: '1', category: 'hotel' });
  });
});

describe('PoiLayer', () => {
  it('rend une source clusterisée + calque points pour chaque calque visible', async () => {
    await render(
      <PoiLayer
        poisByLayer={{ ...EMPTY_BY_LAYER, accommodations: [makePoi('1', 'hotel')] }}
        visibleLayers={new Set(['accommodations'])}
        onSelectPoi={jest.fn()}
        getCamera={() => null}
      />,
    );
    expect(screen.getByTestId('pois-accommodations')).toBeOnTheScreen();
    expect(screen.getByTestId('pois-accommodations-points')).toBeOnTheScreen();
    expect(screen.getByTestId('pois-accommodations-clusters')).toBeOnTheScreen();
  });

  it('ne rend PAS les calques non visibles (indépendance, AC1)', async () => {
    await render(
      <PoiLayer
        poisByLayer={EMPTY_BY_LAYER}
        visibleLayers={new Set(['accommodations'])}
        onSelectPoi={jest.fn()}
        getCamera={() => null}
      />,
    );
    expect(screen.getByTestId('pois-accommodations')).toBeOnTheScreen();
    expect(screen.queryByTestId('pois-restaurants')).toBeNull();
  });
});
