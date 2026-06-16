import type { MapWaypoint } from '@ridenrest/shared';

// Surbrillance du corridor de recherche — port iso de `buildCorridorFeatures` (web
// map-canvas). Un `LineString` des waypoints de la trace dans `[fromKm, toKm]` (km
// **cumulés**, cf. `useAdventureWaypoints`). PUR → testable hors React.

export function buildCorridorFeature(
  waypoints: readonly MapWaypoint[],
  fromKm: number,
  toKm: number,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const coords = waypoints
    .filter((w) => w.distKm >= fromKm && w.distKm <= toKm)
    .map((w) => [w.lng, w.lat] as [number, number]);
  const features: GeoJSON.Feature<GeoJSON.LineString>[] =
    coords.length >= 2
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }]
      : [];
  return { type: 'FeatureCollection', features };
}
