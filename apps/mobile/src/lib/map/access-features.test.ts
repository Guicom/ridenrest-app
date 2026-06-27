import type { AccessVariant } from '@ridenrest/shared';

import {
  buildAccessFeatureCollection,
  computeAccessBounds,
  extractTappedVariantIndex,
  ghostFilter,
  selectedFilter,
} from './access-features';

// Helpers purs de la polyline d'accès (MOB-4.7 / T6). Testés hors React : construction
// de la FeatureCollection (idx + filtrage des coordonnées non finies / MultiLineString),
// bbox englobant, expressions de filtre, extraction de l'index tapé.

function makeVariant(
  geometry: AccessVariant['geometry'],
  overrides: Partial<AccessVariant> = {},
): AccessVariant {
  return {
    entryPoint: [6, 45],
    distanceM: 1000,
    elevationGainM: 10,
    elevationLossM: 5,
    etaS: 240,
    usesMainRoad: false,
    mainRoadDistanceM: 0,
    geometry,
    ...overrides,
  };
}

describe('buildAccessFeatureCollection (T6)', () => {
  it('produit une feature par variante avec `idx` = index d’origine', () => {
    const fc = buildAccessFeatureCollection([
      makeVariant({ type: 'LineString', coordinates: [[6, 45], [6.1, 45.1]] }),
      makeVariant({ type: 'LineString', coordinates: [[7, 46], [7.1, 46.1]] }),
    ]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features.map((f) => f.properties?.idx)).toEqual([0, 1]);
    expect(fc.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [[6, 45], [6.1, 45.1]],
    });
  });

  it('filtre les coordonnées non finies au niveau du point (anti-SIGABRT natif)', () => {
    const fc = buildAccessFeatureCollection([
      makeVariant({
        type: 'LineString',
        coordinates: [[6, 45], [NaN, 45.1], [6.2, 45.2]],
      }),
    ]);
    expect(fc.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [[6, 45], [6.2, 45.2]],
    });
  });

  it('omet une variante qui retombe sous 2 points valides (pas de feature dégénérée)', () => {
    const fc = buildAccessFeatureCollection([
      makeVariant({ type: 'LineString', coordinates: [[6, 45], [Infinity, 1]] }),
      makeVariant({ type: 'LineString', coordinates: [[7, 46], [7.1, 46.1]] }),
    ]);
    // La 1re variante est omise, MAIS la 2de conserve son idx d'origine (1).
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties?.idx).toBe(1);
  });

  it('normalise un MultiLineString (tronçons < 2 points retirés)', () => {
    const fc = buildAccessFeatureCollection([
      makeVariant({
        type: 'MultiLineString',
        coordinates: [
          [[6, 45], [6.1, 45.1]],
          [[7, 46]], // < 2 points → retiré
        ],
      }),
    ]);
    expect(fc.features[0].geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [[[6, 45], [6.1, 45.1]]],
    });
  });

  it('renvoie une FeatureCollection vide pour aucune variante', () => {
    expect(buildAccessFeatureCollection([]).features).toEqual([]);
  });
});

describe('computeAccessBounds (T6)', () => {
  it('englobe toutes les variantes (LineString + MultiLineString)', () => {
    const bounds = computeAccessBounds([
      makeVariant({ type: 'LineString', coordinates: [[6, 45], [6.5, 45.5]] }),
      makeVariant({
        type: 'MultiLineString',
        coordinates: [[[5.5, 44.5], [7, 46]]],
      }),
    ]);
    expect(bounds).not.toBeNull();
    const [west, south, east, north] = bounds!;
    // Le buffer (computeBoundingBox, ~1 km) élargit légèrement min/max.
    expect(west).toBeLessThanOrEqual(5.5);
    expect(south).toBeLessThanOrEqual(44.5);
    expect(east).toBeGreaterThanOrEqual(7);
    expect(north).toBeGreaterThanOrEqual(46);
  });

  it('renvoie null si aucune coordonnée valide', () => {
    const bounds = computeAccessBounds([
      makeVariant({ type: 'LineString', coordinates: [[NaN, NaN], [Infinity, 1]] }),
    ]);
    expect(bounds).toBeNull();
  });
});

describe('filtres idx (T6)', () => {
  it('ghostFilter = toutes SAUF la sélectionnée', () => {
    expect(ghostFilter(2)).toEqual(['!=', ['get', 'idx'], 2]);
  });
  it('selectedFilter = uniquement la sélectionnée', () => {
    expect(selectedFilter(1)).toEqual(['==', ['get', 'idx'], 1]);
  });
});

describe('extractTappedVariantIndex (T6)', () => {
  it('lit `idx` depuis nativeEvent.features', () => {
    const event = {
      nativeEvent: { features: [{ type: 'Feature', properties: { idx: 3 } }] },
    };
    expect(extractTappedVariantIndex(event)).toBe(3);
  });
  it('lit `idx` depuis un payload direct (hors device)', () => {
    const event = { features: [{ type: 'Feature', properties: { idx: 0 } }] };
    expect(extractTappedVariantIndex(event)).toBe(0);
  });
  it('renvoie null sans feature exploitable', () => {
    expect(extractTappedVariantIndex({})).toBeNull();
    expect(extractTappedVariantIndex({ features: [] })).toBeNull();
    expect(
      extractTappedVariantIndex({ features: [{ properties: {} }] }),
    ).toBeNull();
  });
});
