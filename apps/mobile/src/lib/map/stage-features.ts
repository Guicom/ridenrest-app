import type { AdventureStageResponse, MapWaypoint } from '@ridenrest/shared';

// Colorisation de la trace **par étape** — port iso du web (chaque étape recolore le
// tronçon `[startKm, endKm]` de la trace avec `stage.color`). PUR → testable.
// `waypoints` sont en km **cumulés** (cf. `useAdventureWaypoints`).

export function buildStageColoredFeatures(
  waypoints: readonly MapWaypoint[],
  stages: readonly AdventureStageResponse[],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const stage of stages) {
    const coords = waypoints
      .filter((w) => w.distKm >= stage.startKm && w.distKm <= stage.endKm)
      .map((w) => [w.lng, w.lat] as [number, number]);
    if (coords.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: { color: stage.color, stageId: stage.id },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }
  return features;
}
