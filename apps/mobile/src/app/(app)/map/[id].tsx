import type { MapLayer, MapSegmentData, MapWaypoint, Poi } from '@ridenrest/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvgSpeedCard } from '@/components/map/avg-speed-card';
import { CorridorHighlightLayer } from '@/components/map/corridor-highlight-layer';
import { CorridorPill } from '@/components/map/corridor-pill';
import { DensityLayer } from '@/components/map/density-layer';
import { MapCanvas, type MapCanvasHandle } from '@/components/map/map-canvas';
import { MapSearchFeedback } from '@/components/map/map-search-feedback';
import { PlanningSidebar } from '@/components/map/planning-sidebar';
import { PoiLayer } from '@/components/map/poi-layer';
import { PoiPopup } from '@/components/map/poi-popup';
import { SearchRangeControl } from '@/components/map/search-range-control';
import { SidebarDensitySection } from '@/components/map/sidebar-density-section';
import { SidebarStagesSection } from '@/components/map/sidebar-stages-section';
import { SidebarWeatherSection } from '@/components/map/sidebar-weather-section';
import { StageMarkers } from '@/components/map/stage-markers';
import { StageTraceLayer } from '@/components/map/stage-trace-layer';
import { WeatherLayer } from '@/components/map/weather-layer';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { ChevronLeftIcon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdventure } from '@/hooks/use-adventures';
import { isMapParsing, useAdventureMap } from '@/hooks/use-adventure-map';
import { useAdventureWaypoints } from '@/hooks/use-adventure-waypoints';
import { useDensity } from '@/hooks/use-density';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { usePois } from '@/hooks/use-pois';
import { useProfile } from '@/hooks/use-profile';
import { useStages } from '@/hooks/use-stages';
import { useWeather } from '@/hooks/use-weather';
import {
  collectTraceWaypoints,
  computeCorridorBounds,
  computeTraceBounds,
  hasTrace,
} from '@/lib/map/maplibre-config';
import { useMapStore } from '@/lib/stores/map.store';
import { useTranslation } from '@/lib/i18n';

// Écran carte mode **planning** (MOB-4.x, iso web). Carte plein écran + **drawer**
// (`PlanningSidebar`) avec les 5 cartes : Vitesse, Recherche, Étapes, Météo, Densité.
// État planning dans `useMapStore` (Zustand). Overlays carte : POI, marqueurs d'étapes,
// densité, météo. RGPD : seuls segmentId + km cumulés partent à l'API (jamais de GPS).

const SEGMENT_KM_EPSILON = 0.001;

function findSegmentIdForKm(
  segments: readonly MapSegmentData[],
  km: number,
): string | null {
  const seg = segments.find(
    (s) =>
      km >= s.cumulativeStartKm - SEGMENT_KM_EPSILON &&
      km <= s.cumulativeStartKm + s.distanceKm + SEGMENT_KM_EPSILON,
  );
  return seg?.id ?? segments[0]?.id ?? null;
}

/** km cumulé du waypoint le plus proche d'un point tapé (snap au tracé). */
function nearestKm(
  waypoints: readonly MapWaypoint[],
  lng: number,
  lat: number,
): number | null {
  let best: MapWaypoint | null = null;
  let bestD = Infinity;
  for (const wp of waypoints) {
    const d = (wp.lng - lng) ** 2 + (wp.lat - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = wp;
    }
  }
  return best?.distKm ?? null;
}

/** « 2026-06-15 07:30 » → ISO, sinon null. */
function parseDeparture(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = (rawId ?? '').trim();
  const { isOnline } = useNetworkStatus();

  const adventure = useAdventure(id);
  const map = useAdventureMap(id);
  const stagesApi = useStages(id);

  const segments = useMemo(() => map.data?.segments ?? [], [map.data]);
  const stages = stagesApi.stages;
  const traceReady = hasTrace(segments);
  const totalDistanceKm = map.data?.totalDistanceKm ?? 0;
  const avgSpeedKmh = adventure.data?.avgSpeedKmh ?? 0;
  const title = adventure.data?.name ?? t('map.title');
  const paddingTop = insets.top + 12;
  const waypoints = useAdventureWaypoints(segments);
  const allSegmentsParsed =
    segments.length > 0 && segments.every((s) => s.parseStatus === 'done');

  // État planning (store Zustand, parité web)
  const visibleLayers = useMapStore((s) => s.visibleLayers);
  const fromKm = useMapStore((s) => s.fromKm);
  const toKm = useMapStore((s) => s.toKm);
  const searchCommitted = useMapStore((s) => s.searchCommitted);
  const searchRangeInteracted = useMapStore((s) => s.searchRangeInteracted);
  const activeAccommodationTypes = useMapStore((s) => s.activeAccommodationTypes);
  const stagesVisible = useMapStore((s) => s.stagesVisible);
  const setStagesVisible = useMapStore((s) => s.setStagesVisible);
  const weatherActive = useMapStore((s) => s.weatherActive);
  const weatherDimension = useMapStore((s) => s.weatherDimension);
  const densityColorEnabled = useMapStore((s) => s.densityColorEnabled);

  // Flag Overpass opt-in (profil) — parité web : sans lui, la recherche tournait
  // toujours en `overpassEnabled=false` → 0 résultat hors cache Google.
  const { data: profile } = useProfile();
  const overpassEnabled = profile?.overpassEnabled ?? false;

  const { poisByLayer, isFetching, isError, isEmpty } = usePois({
    adventureId: id,
    segments,
    visibleLayers,
    fromKm,
    toKm,
    overpassEnabled,
    enabled: traceReady && searchCommitted,
  });

  // Densité (statut + coverage gaps pour l'overlay)
  const density = useDensity(id);

  // Météo : heure de départ globale (texte) → ISO ; départs par étape prioritaires.
  const [departureInput, setDepartureInput] = useState('');
  const stageDeparturesJson = useMemo(() => {
    const withDep = stages.filter((s) => s.departureTime != null);
    if (withDep.length === 0) return null;
    return JSON.stringify(
      withDep.map((s) => ({
        startKm: s.startKm,
        endKm: s.endKm,
        departureTime: s.departureTime,
      })),
    );
  }, [stages]);
  const { weatherPoints } = useWeather({
    segments,
    weatherActive,
    departureTime: parseDeparture(departureInput),
    speedKmh: avgSpeedKmh || undefined,
    stageDepartures: stageDeparturesJson,
  });

  // Affichage carte : hébergements filtrés par sous-type actif (compteurs = liste complète).
  const displayPoisByLayer = useMemo<Record<MapLayer, Poi[]>>(
    () => ({
      ...poisByLayer,
      accommodations: poisByLayer.accommodations.filter((p) =>
        activeAccommodationTypes.has(p.category),
      ),
    }),
    [poisByLayer, activeAccommodationTypes],
  );
  const displayPois = useMemo(
    () => Object.values(displayPoisByLayer).flat(),
    [displayPoisByLayer],
  );

  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const selectedPoi = useMemo(
    () => displayPois.find((p) => p.id === selectedPoiId) ?? null,
    [displayPois, selectedPoiId],
  );
  const selectedSegmentId = selectedPoi
    ? findSegmentIdForKm(segments, selectedPoi.distAlongRouteKm)
    : null;

  const mapRef = useRef<MapCanvasHandle>(null);
  const getCamera = useCallback(() => mapRef.current?.getCamera() ?? null, []);
  const getMap = useCallback(() => mapRef.current?.getMap() ?? null, []);
  const handleCloseSheet = useCallback(() => setSelectedPoiId(null), []);

  if (selectedPoiId !== null && !displayPois.some((p) => p.id === selectedPoiId)) {
    setSelectedPoiId(null);
  }

  // Drawer + placement d'étape (tap trace). Fermé par défaut (parité web mobile).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stageClickMode, setStageClickMode] = useState(false);
  const [pendingEndKm, setPendingEndKm] = useState<number | null>(null);

  useEffect(() => {
    const unsub = useMapStore.subscribe((state, prev) => {
      if (state.searchCommitted && !prev.searchCommitted) setSidebarOpen(false);
    });
    return unsub;
  }, []);

  // Reset du store corridor au démontage — évite l'auto-search lors d'une re-navigation
  // vers une autre aventure (AC1 : recherche uniquement au clic explicite).
  useEffect(() => {
    return () => {
      useMapStore.setState({ searchCommitted: false, searchRangeInteracted: false, fromKm: 0, toKm: 15 });
    };
  }, []);

  // Zoom auto sur le corridor après une recherche committée (parité web
  // `fitToCorridorRange`) : on détecte la transition `isFetching` true→false. Fallback
  // sur la trace entière si la plage [fromKm, toKm] contient moins de 2 waypoints.
  const prevFetchingRef = useRef(isFetching);
  useEffect(() => {
    if (searchCommitted && prevFetchingRef.current && !isFetching) {
      const bounds =
        computeCorridorBounds(waypoints, fromKm, toKm) ??
        computeTraceBounds(collectTraceWaypoints(segments));
      mapRef.current?.fitToBounds(bounds);
    }
    prevFetchingRef.current = isFetching;
    // ⚠️ PAS de cleanup `prevFetchingRef.current = false` ici : l'effet dépend de
    // `waypoints/fromKm/toKm/segments`, donc se ré-exécute souvent. Un reset en cleanup
    // tournerait AVANT chaque ré-exécution → `prev` serait remis à false juste avant la
    // détection de transition → le zoom ne partirait jamais (régression code review).
  }, [isFetching, searchCommitted, waypoints, fromKm, toKm, segments]);

  const handleMapPress = useCallback(
    (lngLat: [number, number]) => {
      if (!stageClickMode) return;
      const km = nearestKm(waypoints, lngLat[0], lngLat[1]);
      if (km == null) return;
      setPendingEndKm(km);
      setSidebarOpen(true);
    },
    [stageClickMode, waypoints],
  );

  const header = (
    <View
      pointerEvents="box-none"
      style={{ paddingTop }}
      className="absolute left-0 right-0 top-0 z-10 px-4 pb-3"
    >
      <View pointerEvents="box-none" className="flex-row items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="bg-card/80"
          accessibilityLabel={t('map.back')}
          onPress={() => router.back()}
        >
          <ChevronLeftIcon size={22} className="text-text-primary" />
        </Button>
        <View className="flex-1 rounded-lg bg-card/80 px-3 py-2">
          <Text
            numberOfLines={1}
            className="text-base font-montserrat-semibold text-text-primary"
          >
            {title}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!id) {
    return (
      <View className="flex-1 bg-background-page">
        {header}
        <View
          className="flex-1 items-center justify-center px-8"
          style={{ paddingTop }}
        >
          <Text className="text-center text-sm font-montserrat text-text-muted">
            {t('map.empty')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-page">
      <MapCanvas
        ref={mapRef}
        segments={segments}
        onMapPress={stageClickMode ? handleMapPress : undefined}
      >
        <DensityLayer
          segments={segments}
          coverageGaps={density.coverageGaps}
          enabled={densityColorEnabled && density.densityStatus === 'success'}
        />
        <WeatherLayer
          waypoints={waypoints}
          weatherPoints={weatherPoints}
          dimension={weatherDimension}
          enabled={weatherActive}
        />
        <StageTraceLayer
          waypoints={waypoints}
          stages={stages}
          visible={stagesVisible}
        />
        <CorridorHighlightLayer
          waypoints={waypoints}
          fromKm={fromKm}
          toKm={toKm}
          visible={searchRangeInteracted}
        />
        <StageMarkers
          stages={stages}
          waypoints={waypoints}
          visible={stagesVisible}
        />
        <PoiLayer
          poisByLayer={displayPoisByLayer}
          visibleLayers={visibleLayers}
          onSelectPoi={setSelectedPoiId}
          getCamera={getCamera}
        />
        <PoiPopup
          poi={selectedPoi}
          segmentId={selectedSegmentId}
          onClose={handleCloseSheet}
          getCamera={getCamera}
          getMap={getMap}
        />
      </MapCanvas>
      {header}

      {traceReady ? (
        <MapSearchFeedback
          isFetching={isFetching}
          isError={isError}
          isEmpty={isEmpty}
          onRetry={() => useMapStore.getState().setSearchCommitted(true)}
        />
      ) : null}

      {traceReady && searchRangeInteracted ? (
        <View
          pointerEvents="none"
          style={{ bottom: insets.bottom + 16 }}
          className="absolute left-0 right-0 z-20 items-center"
        >
          <CorridorPill fromKm={fromKm} toKm={toKm} />
        </View>
      ) : null}

      {stageClickMode ? (
        <View
          pointerEvents="none"
          style={{ top: insets.top + 60 }}
          className="absolute left-0 right-0 z-20 items-center"
        >
          <View className="rounded-full bg-primary/90 px-4 py-2">
            <Text className="text-sm font-montserrat-semibold text-white">
              {t('map.stages.placementHint')}
            </Text>
          </View>
        </View>
      ) : null}

      {traceReady ? (
        <PlanningSidebar open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <AvgSpeedCard
            adventureId={id}
            avgSpeedKmh={avgSpeedKmh}
            isOnline={isOnline}
          />
          <SearchRangeControl
            totalDistanceKm={totalDistanceKm}
            waypoints={waypoints}
            isPoisPending={isFetching}
            accommodationPois={poisByLayer.accommodations}
            stages={stages}
            isOnline={isOnline}
          />
          <SidebarStagesSection
            stages={stages}
            defaultSpeedKmh={avgSpeedKmh}
            stagesVisible={stagesVisible}
            onStagesVisibilityChange={setStagesVisible}
            isClickModeActive={stageClickMode}
            onEnterClickMode={() => {
              setStageClickMode(true);
              setSidebarOpen(false);
            }}
            onExitClickMode={() => setStageClickMode(false)}
            pendingEndKm={pendingEndKm}
            onPendingHandled={() => setPendingEndKm(null)}
            onCreate={stagesApi.createStage}
            onUpdate={stagesApi.updateStage}
            onDelete={stagesApi.deleteStage}
            isOnline={isOnline}
          />
          <SidebarWeatherSection
            departureTime={departureInput}
            onDepartureChange={setDepartureInput}
            stagesHaveDepartures={stageDeparturesJson !== null}
          />
          <SidebarDensitySection
            adventureId={id}
            allSegmentsParsed={allSegmentsParsed}
          />
        </PlanningSidebar>
      ) : null}

      {!isOnline ? (
        <View
          pointerEvents="none"
          style={{ top: insets.top + 64 }}
          className="absolute left-4 right-4 z-10"
        >
          <View
            accessibilityRole="alert"
            className="rounded-lg border border-text-muted bg-text-muted/10 px-3 py-2"
          >
            <Text className="text-center text-xs font-montserrat text-text-muted">
              {t('map.tilesOffline')}
            </Text>
          </View>
        </View>
      ) : null}

      {map.isPending && map.fetchStatus !== 'paused' ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 z-10 items-center justify-center px-8"
        >
          <Skeleton className="h-10 w-40 rounded-lg" />
        </View>
      ) : map.isError && !map.data ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-0 z-10 items-center justify-center px-8"
        >
          <ErrorBanner message={t('map.loadFailed')} />
        </View>
      ) : isMapParsing(map.data) ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 z-10 items-center justify-center px-8"
        >
          <View className="rounded-lg bg-card/90 px-4 py-3">
            <Text className="text-center text-sm font-montserrat text-text-primary">
              {t('map.parsing')}
            </Text>
          </View>
        </View>
      ) : !traceReady ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-0 z-10 items-center justify-center gap-3 px-8"
        >
          <View className="rounded-lg bg-card/90 px-4 py-3">
            <Text className="text-center text-sm font-montserrat text-text-primary">
              {t('map.empty')}
            </Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            className="bg-card/90"
            label={t('map.emptyCta')}
            onPress={() => router.back()}
          />
        </View>
      ) : null}
    </View>
  );
}
