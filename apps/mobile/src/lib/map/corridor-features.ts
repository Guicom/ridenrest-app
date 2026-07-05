import type { MapWaypoint } from '@ridenrest/shared';

import { isValidLngLat } from '@/lib/map/maplibre-config';

// Surbrillance du corridor de recherche — port iso de `buildCorridorFeatures` (web
// map-canvas). Un `LineString` des waypoints de la trace dans `[fromKm, toKm]` (km
// **cumulés**, cf. `useAdventureWaypoints`). PUR → testable hors React.
//
// ⚠️ Filtre `isValidLngLat` au point : une coordonnée non finie fait throw `mbgl::geojson`
// côté natif (SIGABRT). Défense en profondeur même si l'amont (`useAdventureWaypoints`)
// filtre déjà — règle AGENTS.md : tout builder de `<GeoJSONSource>` garde ses coords.

export function buildCorridorFeature(
  waypoints: readonly MapWaypoint[],
  fromKm: number,
  toKm: number,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const coords = waypoints
    .filter((w) => w.distKm >= fromKm && w.distKm <= toKm && isValidLngLat(w.lng, w.lat))
    .map((w) => [w.lng, w.lat] as [number, number]);
  const features: GeoJSON.Feature<GeoJSON.LineString>[] =
    coords.length >= 2
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }]
      : [];
  return { type: 'FeatureCollection', features };
}
