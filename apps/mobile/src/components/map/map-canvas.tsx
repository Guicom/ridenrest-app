import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type LngLatBounds,
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
import { View, type LayoutChangeEvent } from 'react-native';

import { OsmAttribution } from '@/components/shared/osm-attribution';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  buildTraceFeatureCollection,
  CAMERA_ANIMATION_MS,
  collectTraceWaypoints,
  computeTraceBounds,
  getMapStyle,
  safeFitPadding,
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
  /**
   * Fit caméra sur un bbox arbitraire (zoom corridor après recherche, parité web
   * `fitToCorridorRange`). No-op si `bounds` est `null` ou si la carte n'est pas
   * encore mesurée (le padding clampé serait nul → fit invalide).
   */
  fitToBounds: (bounds: LngLatBounds | null) => void;
}

export interface MapCanvasProps {
  segments: readonly MapSegmentData[];
  /** Calques carte additionnels (stories suivantes) insérés dans le `<Map>`. */
  children?: ReactNode;
  /** Tap sur la carte (placement d'étape) → coordonnées `[lng, lat]`. */
  onMapPress?: (lngLat: [number, number]) => void;
  /**
   * Mouvement de carte **en cours** (pan/zoom continu) — pour repositionner un overlay RN
   * projeté (ex. le popup POI, MOB-4.2 refonte). Le popup n'est PAS un `<Marker>` (bitmap
   * non-interactif sur iOS) mais une View RN absolue projetée via `getMap().project()` ; il
   * doit donc suivre le pin à chaque frame de mouvement.
   */
  onRegionIsChanging?: () => void;
  /** Fin de mouvement de carte — snap final de la position de l'overlay. */
  onRegionDidChange?: () => void;
}

/** Extrait `[lng, lat]` d'un évènement de press carte (formes variables selon la build). */
function extractPressCoords(event: unknown): [number, number] | null {
  const e = event as {
    geometry?: { coordinates?: number[] };
    nativeEvent?: {
      geometry?: { coordinates?: number[] };
      coordinate?: { latitude?: number; longitude?: number };
    };
  };
  const coords = e?.geometry?.coordinates ?? e?.nativeEvent?.geometry?.coordinates;
  if (coords && coords.length >= 2) return [coords[0]!, coords[1]!];
  const c = e?.nativeEvent?.coordinate;
  if (c && c.latitude != null && c.longitude != null) {
    return [c.longitude, c.latitude];
  }
  return null;
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(
  function MapCanvas(
    { segments, children, onMapPress, onRegionIsChanging, onRegionDidChange },
    ref,
  ) {
    const { colorScheme } = useColorScheme();
    const cameraRef = useRef<CameraRef>(null);
    const mapRef = useRef<MapRef>(null);
    const [styleLoaded, setStyleLoaded] = useState(false);
    // Taille rendue de la carte (px) — sert à clamper le padding du fit (MapLibre
    // Native échoue si `2×padding ≥ min(w,h)`, ex. avant le premier layout natif).
    const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
    // Dernier bbox sur lequel on a fit : garantit un seul fit par jeu de waypoints
    // (parité web `lastZoomedRef`) et évite un re-fit au changement de thème.
    const lastFitRef = useRef<string | null>(null);

    const handleLayout = (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setMapSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    };

    useImperativeHandle(
      ref,
      () => ({
        getCamera: () => cameraRef.current,
        getMap: () => mapRef.current,
        fitToBounds: (bounds: LngLatBounds | null) => {
          if (!bounds) return;
          if (mapSize.width <= 0 || mapSize.height <= 0) return;
          const padding = safeFitPadding(mapSize.width, mapSize.height);
          cameraRef.current?.fitBounds(bounds, {
            padding: { top: padding, right: padding, bottom: padding, left: padding },
            duration: CAMERA_ANIMATION_MS,
          });
        },
      }),
      [mapSize.width, mapSize.height],
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

    // Fit auto (FR-026) : une fois le style chargé, la carte MESURÉE, ET à chaque
    // nouveau bbox. Le gate sur `mapSize` évite le fit avant le 1er layout natif
    // (sinon erreur MapLibre « padding > map size »). Le padding est clampé à la
    // taille rendue via `safeFitPadding`. Le `lastFitRef` zoom-une-fois empêche un
    // re-fit quand le thème recharge le style (mais re-fit bien à nouveau bbox).
    useEffect(() => {
      if (!styleLoaded || !bounds || boundsKey === null) return;
      if (mapSize.width <= 0 || mapSize.height <= 0) return;
      if (lastFitRef.current === boundsKey) return;
      lastFitRef.current = boundsKey;
      const padding = safeFitPadding(mapSize.width, mapSize.height);
      cameraRef.current?.fitBounds(bounds, {
        padding: { top: padding, right: padding, bottom: padding, left: padding },
        duration: CAMERA_ANIMATION_MS,
      });
    }, [styleLoaded, bounds, boundsKey, mapSize.width, mapSize.height]);

    return (
      <View className="flex-1" onLayout={handleLayout}>
        <Map
          ref={mapRef}
          style={{ flex: 1 }}
          mapStyle={getMapStyle(colorScheme === 'dark' ? 'dark' : 'light')}
          logo={false}
          attribution
          attributionPosition={{ bottom: 8, right: 8 }}
          compass={false}
          onDidFinishLoadingStyle={() => setStyleLoaded(true)}
          onRegionIsChanging={onRegionIsChanging}
          onRegionDidChange={onRegionDidChange}
          onPress={
            onMapPress
              ? (event: unknown) => {
                  const coords = extractPressCoords(event);
                  if (coords) onMapPress(coords);
                }
              : undefined
          }
        >
          <Camera ref={cameraRef} />
          {/* ⚠️ CRITIQUE — ne monter AUCUNE `<GeoJSONSource>` (trace + calques enfants)
              avant `onDidFinishLoadingStyle`. Un `setShape` exécuté pendant le chargement
              du style provoque une exception C++ non rattrapée dans MapLibre Native
              (`-[MLRNGeoJSONSource setShape:]` → `mbgl` → `__cxa_throw` → SIGABRT). Le cas
              se déclenche surtout quand la `data` est disponible **synchrone** au 1er rendu
              (cache TanStack chaud : on ouvre une aventure déjà visitée) → la source se
              monte avec sa donnée avant que le style soit prêt. À froid (fetch async après
              le style) le bug ne se voyait pas → crash « intermittent » à l'ouverture du
              planning. Gater sur `styleLoaded` sérialise tout après le style. (2026-06-27) */}
          {styleLoaded ? (
            <>
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
            </>
          ) : null}
        </Map>
        {/* Attribution OSM permanente — overlay frère, toujours visible (AC3). */}
        <OsmAttribution />
      </View>
    );
  },
);
