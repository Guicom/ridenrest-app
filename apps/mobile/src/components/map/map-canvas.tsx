import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type LngLatBounds,
  type MapRef,
  type ViewStateChangeEvent,
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
import {
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { OsmAttribution } from '@/components/shared/osm-attribution';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  buildTraceFeatureCollection,
  CAMERA_ANIMATION_MS,
  collectTraceWaypoints,
  computeTraceBounds,
  getMapStyle,
  lookAheadPadding,
  routeBearingAtPosition,
  safeFitPadding,
  TRACE_COLOR,
  TRACE_WIDTH,
} from '@/lib/map/maplibre-config';
import { useLiveStore } from '@/lib/stores/live.store';

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
  /**
   * Re-cadre sur toute la trace (bouton « recentrer zoom », parité web `resetZoom`). Met
   * le suivi GPS en pause (`gpsTrackingActive=false`) quand une position est active, sinon
   * le prochain fix easeTo-erait aussitôt vers le GPS.
   */
  resetZoom: () => void;
  /**
   * Recentre la caméra sur la position GPS courante et **réactive** le suivi auto
   * (`gpsTrackingActive=true`) — bouton « recentrer » (AC5). No-op sans position GPS.
   */
  centerOnGps: () => void;
  /**
   * Fit caméra sur la zone de recherche Live (cercle cible±rayon, MOB-5.3 / AC3). Comme
   * `fitToBounds` mais avec un **padding bas** supplémentaire (`bottomPaddingPx`, hauteur
   * du panneau Live) pour que le cercle reste cadré AU-DESSUS du panneau. Met le suivi GPS
   * en pause **après** le fit (sinon le prochain easeTo GPS annulerait le re-cadrage, bug
   * 16-26). No-op si `bounds` null ou carte non mesurée.
   */
  fitToSearchZone: (bounds: LngLatBounds | null, bottomPaddingPx?: number) => void;
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

    // ── Suivi GPS auto (MOB-5.2 / AC5) ───────────────────────────────────────────
    // Lecture **réactive** de la position + du flag de suivi depuis `useLiveStore`. En
    // mode Planning, `currentPosition` est toujours `null` → l'effet de suivi ci-dessous
    // est un no-op (zéro impact sur la carte de recherche). Le `gpsTrackingActive`
    // passe `false` au pan manuel et est réactivé par `centerOnGps()`.
    const currentPosition = useLiveStore((s) => s.currentPosition);
    const gpsTrackingActive = useLiveStore((s) => s.gpsTrackingActive);
    // Premier fix : on zoome (`flyTo`, zoom 14) ; les suivants suivent doucement (`easeTo`).
    const hasInitialZoomedRef = useRef(false);
    // Waypoints `{lat,lng}` pour le cap de la trace (offset look-ahead) — `km` inutile ici.
    const bearingWaypoints = useMemo(
      () => collectTraceWaypoints(segments),
      [segments],
    );

    const trace = useMemo(
      () => buildTraceFeatureCollection(segments),
      [segments],
    );
    const bounds = useMemo(
      () => computeTraceBounds(bearingWaypoints),
      [bearingWaypoints],
    );
    const hasTrace = trace.features.length > 0;
    const boundsKey = bounds ? bounds.join(',') : null;

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
        resetZoom: () => {
          if (!bounds) return;
          if (mapSize.width <= 0 || mapSize.height <= 0) return;
          // Pause du suivi GPS (s'il y a une position) — sinon le prochain fix re-centre
          // 0,4 s plus tard et annule le re-cadrage (bug web 16-26).
          if (useLiveStore.getState().currentPosition) {
            useLiveStore.getState().setGpsTrackingActive(false);
          }
          const padding = safeFitPadding(mapSize.width, mapSize.height);
          cameraRef.current?.fitBounds(bounds, {
            padding: { top: padding, right: padding, bottom: padding, left: padding },
            duration: CAMERA_ANIMATION_MS,
          });
        },
        fitToSearchZone: (
          bounds: LngLatBounds | null,
          bottomPaddingPx = 0,
        ) => {
          if (!bounds) return;
          if (mapSize.width <= 0 || mapSize.height <= 0) return;
          const base = safeFitPadding(mapSize.width, mapSize.height);
          // Padding bas = panneau Live, clampé pour garantir `top + bottom < height`
          // (sinon MapLibre Native émet « padding > map height »).
          const bottom = Math.min(
            Math.max(base, bottomPaddingPx),
            Math.max(0, mapSize.height - base - 1),
          );
          cameraRef.current?.fitBounds(bounds, {
            padding: { top: base, right: base, bottom, left: base },
            duration: CAMERA_ANIMATION_MS,
          });
          // Pause du suivi GPS APRÈS le fit (sinon le prochain easeTo GPS le recouvre).
          if (useLiveStore.getState().currentPosition) {
            useLiveStore.getState().setGpsTrackingActive(false);
          }
        },
        centerOnGps: () => {
          const pos = useLiveStore.getState().currentPosition;
          const cam = cameraRef.current;
          if (!pos || !cam) return;
          // Réactive le suivi auto (AC5) avant de voler vers le GPS.
          useLiveStore.getState().setGpsTrackingActive(true);
          const bearing =
            bearingWaypoints.length >= 2
              ? routeBearingAtPosition(bearingWaypoints, pos)
              : 0;
          cam.flyTo({
            center: [pos.lng, pos.lat],
            zoom: 14,
            padding: lookAheadPadding(bearing),
            duration: 800,
          });
        },
      }),
      [mapSize.width, mapSize.height, bounds, bearingWaypoints],
    );

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

    // Suivi GPS auto (MOB-5.2 / AC5). No-op en Planning (`currentPosition` null). Premier
    // fix → `flyTo` zoom 14 ; fixes suivants → `easeTo` doux, tant que l'utilisateur n'a pas
    // pané (`gpsTrackingActive`). L'offset look-ahead place le GPS hors centre (voir devant)
    // via le `padding` de `setCamera` (MapLibre Native n'a pas d'offset pixel comme le web).
    // Quand la position retombe à `null` (GPS perdu / sortie Live), on réarme le 1er fix.
    useEffect(() => {
      if (!styleLoaded) return;
      if (mapSize.width <= 0 || mapSize.height <= 0) return;
      if (!currentPosition) {
        hasInitialZoomedRef.current = false;
        return;
      }
      if (!gpsTrackingActive) return;
      const cam = cameraRef.current;
      if (!cam) return;
      const bearing =
        bearingWaypoints.length >= 2
          ? routeBearingAtPosition(bearingWaypoints, currentPosition)
          : 0;
      const padding = lookAheadPadding(bearing);
      if (!hasInitialZoomedRef.current) {
        hasInitialZoomedRef.current = true;
        cam.flyTo({
          center: [currentPosition.lng, currentPosition.lat],
          zoom: 14,
          padding,
          duration: 1000,
        });
      } else {
        // Suivi : on ne passe PAS de `zoom` (préserve le niveau choisi par l'utilisateur).
        cam.easeTo({
          center: [currentPosition.lng, currentPosition.lat],
          padding,
          duration: 400,
        });
      }
    }, [
      currentPosition,
      gpsTrackingActive,
      styleLoaded,
      mapSize.width,
      mapSize.height,
      bearingWaypoints,
    ]);

    // Pan/zoom manuel → pause du suivi auto (AC5). MapLibre Native expose
    // `nativeEvent.userInteraction` : on ne coupe le suivi QUE sur un geste utilisateur (les
    // `flyTo`/`easeTo` programmatiques ont `userInteraction=false`). Gardé par
    // `currentPosition` pour ne jamais muter le store en mode Planning.
    const handleRegionIsChanging = (
      event: NativeSyntheticEvent<ViewStateChangeEvent>,
    ) => {
      if (
        event.nativeEvent?.userInteraction &&
        useLiveStore.getState().currentPosition &&
        useLiveStore.getState().gpsTrackingActive
      ) {
        useLiveStore.getState().setGpsTrackingActive(false);
      }
      onRegionIsChanging?.();
    };

    return (
      // ⚠️ RGPD — NE PAS RETIRER `accessibilityLabel="ph-no-capture"` (MOB-6.1 / T5, AC4).
      // Là où le session replay PostHog tourne (builds beta), ce label REDACTE la vue carte
      // de l'enregistrement : la trace GPX et — en mode Live — la position GPS de
      // l'utilisateur ne sont JAMAIS enregistrées (la règle « GPS jamais hors device »
      // s'étend à l'écran enregistré). Équivalent natif du `ph-no-capture` web. Ce canvas
      // est partagé par le Planning ET le Live → un seul point de masquage couvre les deux.
      // `accessibilityLabel` sur une View non-`accessible` n'est PAS annoncée par VoiceOver
      // (la View carte n'est pas un élément a11y) → posthog lit le label, les SR l'ignorent.
      <View
        className="flex-1"
        onLayout={handleLayout}
        accessibilityLabel="ph-no-capture"
      >
        <Map
          ref={mapRef}
          style={{ flex: 1 }}
          mapStyle={getMapStyle(colorScheme === 'dark' ? 'dark' : 'light')}
          logo={false}
          attribution
          attributionPosition={{ bottom: 8, right: 8 }}
          compass={false}
          onDidFinishLoadingStyle={() => setStyleLoaded(true)}
          onRegionIsChanging={handleRegionIsChanging}
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
