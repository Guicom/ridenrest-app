import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import type { MapSegmentData } from '@ridenrest/shared';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';

import { OsmAttribution } from '@/components/shared/osm-attribution';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  buildTraceFeatureCollection,
  CAMERA_ANIMATION_MS,
  collectTraceWaypoints,
  computeTraceBounds,
  FIT_PADDING,
  getMapStyle,
  TRACE_COLOR,
  TRACE_WIDTH,
} from '@/lib/map/maplibre-config';

// Canvas carte MapLibre Native (MOB-4.1 / AC1-3). Rend le fond de carte (style
// light/dark via `useColorScheme`), la **trace GPX** (LineString `#2D6A4A` w3), le
// fit caméra auto (FR-026) et l'attribution OSM permanente. **Aucun** état de
// chargement/erreur/vide ici : l'écran route les superpose (séparation nette).
//
// `children` s'insère DANS le `<Map>` (calques POI/densité/accès/météo des stories
// suivantes) ; `OsmAttribution` est un overlay **frère** du `<Map>` (les enfants de
// `<Map>` sont du contenu carte natif, pas des Views RN libres). La ref expose la
// caméra et la carte pour l'auto-zoom POI/accès (MOB-4.2/4.7).

export interface MapCanvasHandle {
  /** Caméra MapLibre (fit/fly) — null tant que la carte n'est pas montée. */
  getCamera: () => CameraRef | null;
  /** Instance carte (projection/requête) — null tant que non montée. */
  getMap: () => MapRef | null;
}

export interface MapCanvasProps {
  segments: readonly MapSegmentData[];
  /** Calques carte additionnels (stories suivantes) insérés dans le `<Map>`. */
  children?: ReactNode;
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(
  function MapCanvas({ segments, children }, ref) {
    const { colorScheme } = useColorScheme();
    const cameraRef = useRef<CameraRef>(null);
    const mapRef = useRef<MapRef>(null);
    const [styleLoaded, setStyleLoaded] = useState(false);
    // Dernier bbox sur lequel on a fit : garantit un seul fit par jeu de waypoints
    // (parité web `lastZoomedRef`) et évite un re-fit au changement de thème.
    const lastFitRef = useRef<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        getCamera: () => cameraRef.current,
        getMap: () => mapRef.current,
      }),
      [],
    );

    const trace = useMemo(
      () => buildTraceFeatureCollection(segments),
      [segments],
    );
    const bounds = useMemo(
      () => computeTraceBounds(collectTraceWaypoints(segments)),
      [segments],
    );
    const hasTrace = trace.features.length > 0;
    const boundsKey = bounds ? bounds.join(',') : null;

    // Fit auto (FR-026) : une fois le style chargé ET à chaque nouveau bbox. Le
    // `lastFitRef` zoom-une-fois empêche un re-fit quand le thème recharge le style.
    useEffect(() => {
      if (!styleLoaded || !bounds || boundsKey === null) return;
      if (lastFitRef.current === boundsKey) return;
      lastFitRef.current = boundsKey;
      cameraRef.current?.fitBounds(bounds, {
        padding: {
          top: FIT_PADDING,
          right: FIT_PADDING,
          bottom: FIT_PADDING,
          left: FIT_PADDING,
        },
        duration: CAMERA_ANIMATION_MS,
      });
    }, [styleLoaded, bounds, boundsKey]);

    return (
      <View className="flex-1">
        <Map
          ref={mapRef}
          style={{ flex: 1 }}
          mapStyle={getMapStyle(colorScheme === 'dark' ? 'dark' : 'light')}
          logo={false}
          attribution
          attributionPosition={{ bottom: 8, right: 8 }}
          compass={false}
          onDidFinishLoadingStyle={() => setStyleLoaded(true)}
        >
          <Camera ref={cameraRef} />
          {hasTrace ? (
            <GeoJSONSource id="trace" data={trace}>
              <Layer
                id="trace-line"
                type="line"
                paint={{
                  'line-color': TRACE_COLOR,
                  'line-width': TRACE_WIDTH,
                  'line-opacity': 0.9,
                }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
            </GeoJSONSource>
          ) : null}
          {children}
        </Map>
        {/* Attribution OSM permanente — overlay frère, toujours visible (AC3). */}
        <OsmAttribution />
      </View>
    );
  },
);
