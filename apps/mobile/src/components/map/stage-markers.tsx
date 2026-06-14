import { Marker } from '@maplibre/maplibre-react-native';
import type { AdventureStageResponse, MapWaypoint } from '@ridenrest/shared';
import { View } from 'react-native';

// Marqueurs d'étapes sur la carte — inséré comme enfant du `<Map>` (via `MapCanvas`).
// Une pastille colorée par étape, ancrée au waypoint le plus proche de `endKm` (km
// cumulé). Port iso des markers web (sans drag-reorder — édition via la liste). `id`
// stable par étape (le `Marker` MapLibre gèle son id au montage).

function nearestWaypoint(
  waypoints: MapWaypoint[],
  km: number,
): MapWaypoint | null {
  if (waypoints.length === 0) return null;
  let closest = waypoints[0]!;
  let minDiff = Math.abs(waypoints[0]!.distKm - km);
  for (const wp of waypoints) {
    const diff = Math.abs(wp.distKm - km);
    if (diff < minDiff) {
      minDiff = diff;
      closest = wp;
    }
  }
  return closest;
}

export interface StageMarkersProps {
  stages: AdventureStageResponse[];
  waypoints: MapWaypoint[];
  visible: boolean;
}

export function StageMarkers({ stages, waypoints, visible }: StageMarkersProps) {
  if (!visible || waypoints.length === 0) return null;
  return (
    <>
      {stages.map((stage) => {
        const wp = nearestWaypoint(waypoints, stage.endKm);
        if (!wp) return null;
        return (
          <Marker
            key={stage.id}
            id={`stage-${stage.id}`}
            lngLat={[wp.lng, wp.lat]}
            anchor="center"
          >
            <View
              className="h-4 w-4 rounded-full border-2 border-white"
              style={{ backgroundColor: stage.color }}
            />
          </Marker>
        );
      })}
    </>
  );
}
