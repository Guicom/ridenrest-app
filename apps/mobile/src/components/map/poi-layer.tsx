import {
  GeoJSONSource,
  Images,
  Layer,
  type CameraRef,
  type GeoJSONSourceRef,
} from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { POI_CLUSTER_COLOR, type MapLayer, type Poi } from '@ridenrest/shared';
import { useMemo, useRef } from 'react';

import { ALL_MAP_LAYERS } from '@/hooks/use-poi-layers';
import {
  buildCategoryIconExpression,
  PIN_IMAGE_SOURCES,
} from '@/lib/map/pin-factory';

// Rendu des POIs sur la carte (MOB-4.2 / AC2, T5). Inséré comme **enfant du `<Map>`**
// (via `MapCanvas` children), au-dessus de la trace. Un `GeoJSONSource` clusterisé
// **par calque visible** (parité web `pois-${layer}`), avec :
//   - calque cercle **cluster** (vert brand `POI_CLUSTER_COLOR`, rayon en `step`),
//   - calque **compteur** (point_count),
//   - calque **points** individuels (couleur catégorie canon via `pin-factory`).
//
// Clustering **natif** MapLibre : `cluster`, `clusterRadius:50`, `clusterMaxZoom:13`
// (parité web). Tap cluster → `getClusterExpansionZoom` + recentrage caméra (expansion).
// Tap pin → `onSelectPoi(id)`.
//
// Pins individuels = **gouttes** (parité web) : `SymbolLayer icon-image` data-driven
// (`buildCategoryIconExpression`), images enregistrées par `<Images>` (PNG rastérisés
// des SVG web, voir `pin-factory.ts`). `icon-anchor: 'bottom'` → la pointe sur le point
// GPS. Le clustering natif reste compatible (clusters = cercle + compteur).

const CLUSTER_RADIUS = 50;
const CLUSTER_MAX_ZOOM = 13;
// Échelle d'affichage des gouttes : source 180×225 px → ~60×75 pt à 0.333 (net @3x).
const PIN_ICON_SIZE = 0.333;

/** `FeatureCollection` GeoJSON des POIs d'un calque (Point `[lng, lat]`, jamais `[lat, lng]`). */
export function buildPoiFeatureCollection(
  pois: readonly Poi[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pois.map((poi) => ({
      type: 'Feature' as const,
      properties: {
        id: poi.id,
        externalId: poi.externalId,
        category: poi.category,
        name: poi.name,
      },
      geometry: { type: 'Point' as const, coordinates: [poi.lng, poi.lat] },
    })),
  };
}

// Extrait les features d'un event de press (résilient à la forme native exacte :
// `nativeEvent.features` typé, mais on tolère un payload direct hors device).
function extractFeatures(event: unknown): GeoJSON.Feature[] {
  const e = event as {
    features?: GeoJSON.Feature[];
    nativeEvent?: { features?: GeoJSON.Feature[] };
  };
  return e?.nativeEvent?.features ?? e?.features ?? [];
}

interface PoiSourceLayerProps {
  layer: MapLayer;
  pois: readonly Poi[];
  onSelectPoi: (poiId: string) => void;
  getCamera: () => CameraRef | null;
}

function PoiSourceLayer({
  layer,
  pois,
  onSelectPoi,
  getCamera,
}: PoiSourceLayerProps) {
  const sourceRef = useRef<GeoJSONSourceRef>(null);
  const data = useMemo(() => buildPoiFeatureCollection(pois), [pois]);
  // Guard double-tap : évite deux `getClusterExpansionZoom` concurrents.
  const tappingRef = useRef(false);

  const handlePress = async (event: unknown) => {
    if (tappingRef.current) return;
    tappingRef.current = true;
    try {
      const feature = extractFeatures(event)[0];
      if (!feature) return;
      const props = (feature.properties ?? {}) as {
        id?: string;
        cluster_id?: number;
        point_count?: number;
      };
      const coords = (feature.geometry as GeoJSON.Point | undefined)?.coordinates;

      // Cluster → zoome au niveau d'expansion, centré sur le cluster.
      if (props.point_count != null && props.cluster_id != null) {
        const zoom = await sourceRef.current
          ?.getClusterExpansionZoom(props.cluster_id)
          .catch(() => null);
        if (zoom != null && coords) {
          getCamera()?.setStop({
            center: coords as [number, number],
            zoom,
            duration: 300,
          });
        }
        return;
      }
      // Pin individuel → sélection (ouvre la fiche).
      if (props.id) onSelectPoi(String(props.id));
    } catch {
      // noop — callback natif fire-and-forget
    } finally {
      tappingRef.current = false;
    }
  };

  return (
    <GeoJSONSource
      id={`pois-${layer}`}
      ref={sourceRef}
      data={data}
      cluster
      clusterRadius={CLUSTER_RADIUS}
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      onPress={handlePress}
    >
      {/* Cluster : cercle vert brand, rayon croissant par paliers (parité web). */}
      <Layer
        id={`pois-${layer}-clusters`}
        type="circle"
        filter={['has', 'point_count']}
        paint={{
          'circle-color': POI_CLUSTER_COLOR,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        }}
      />
      {/* Compteur du cluster. */}
      <Layer
        id={`pois-${layer}-cluster-count`}
        type="symbol"
        filter={['has', 'point_count']}
        layout={{
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        }}
        paint={{ 'text-color': '#ffffff' }}
      />
      {/* Pins individuels : goutte par catégorie (parité web), pointe sur le point GPS. */}
      <Layer
        id={`pois-${layer}-points`}
        type="symbol"
        filter={['!', ['has', 'point_count']]}
        layout={{
          'icon-image': buildCategoryIconExpression() as ExpressionSpecification,
          'icon-size': PIN_ICON_SIZE,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
        }}
      />
    </GeoJSONSource>
  );
}

export interface PoiLayerProps {
  poisByLayer: Record<MapLayer, Poi[]>;
  visibleLayers: Set<MapLayer>;
  onSelectPoi: (poiId: string) => void;
  /** Accès caméra (recentrage à l'expansion de cluster) — via `MapCanvasHandle`. */
  getCamera: () => CameraRef | null;
}

/** Calques POI (un source clusterisé par calque visible). */
export function PoiLayer({
  poisByLayer,
  visibleLayers,
  onSelectPoi,
  getCamera,
}: PoiLayerProps) {
  return (
    <>
      {/* Gouttes enregistrées une fois (référencées par tous les `SymbolLayer` pins). */}
      <Images images={PIN_IMAGE_SOURCES} />
      {ALL_MAP_LAYERS.filter((layer) => visibleLayers.has(layer)).map((layer) => (
        <PoiSourceLayer
          key={layer}
          layer={layer}
          pois={poisByLayer[layer]}
          onSelectPoi={onSelectPoi}
          getCamera={getCamera}
        />
      ))}
    </>
  );
}
