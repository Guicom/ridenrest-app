import { findPointAtKm } from '@ridenrest/gpx';
import { type MapSegmentData } from '@ridenrest/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GeolocationConsent } from '@/components/live/geolocation-consent';
import { LiveControls } from '@/components/live/live-controls';
import {
  computeWindowElevation,
  LiveElevationProfile,
} from '@/components/live/live-elevation-profile';
import { LiveFiltersDrawer } from '@/components/live/live-filters-drawer';
import { LiveNoResultsBanner } from '@/components/live/live-no-results-banner';
import { LiveGpsLayer } from '@/components/map/live-gps-layer';
import { LiveSearchZoneLayer } from '@/components/map/live-search-zone-layer';
import { MapCanvas, type MapCanvasHandle } from '@/components/map/map-canvas';
import { PoiLayer } from '@/components/map/poi-layer';
import { PoiPopup } from '@/components/map/poi-popup';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { ChevronLeftIcon, NavigationIcon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdventure } from '@/hooks/use-adventures';
import { isMapParsing, useAdventureMap } from '@/hooks/use-adventure-map';
import { useAdventureWaypoints } from '@/hooks/use-adventure-waypoints';
import { useLiveMode } from '@/hooks/use-live-mode';
import { useLivePoiSearch } from '@/hooks/use-live-poi-search';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { groupPoisByLayer } from '@/hooks/use-pois';
import { getCorridorCenter } from '@/lib/booking-url';
import {
  collectTraceWaypoints,
  computeSearchZoneBounds,
  computeTraceBounds,
  hasTrace,
} from '@/lib/map/maplibre-config';
import { useLiveStore } from '@/lib/stores/live.store';
import { useMapStore } from '@/lib/stores/map.store';
import { useTranslation } from '@/lib/i18n';

// Écran Live (MOB-5.1 fondation + MOB-5.2 GPS/caméra + **MOB-5.3 découverte POI**). Carte
// plein écran + trace + dot GPS + flow consentement/permission, AUXQUELS s'ajoutent ici :
//   - calques POI Live (pins + clusters, `PoiLayer` réutilisé) + popup (`PoiPopup`),
//   - cercle de rayon + point cible (`LiveSearchZoneLayer`),
//   - panneau de contrôle Live (`LiveControls`) : slider distance, RECHERCHER, ETA,
//   - tiroir filtres (`LiveFiltersDrawer`, persist-on-close),
//   - bannières « Aucun résultat » / « Connexion instable » + dégradation gracieuse.
//
// RGPD : la recherche n'envoie QUE `segmentId` + `targetKm` (km relatif) + `radiusKm` —
// jamais de lat/lng (NFR-012). La position GPS reste sur le device.
//
// Le **re-design** du panneau + section PROFIL repliable = MOB-5.4 ; le profil
// d'élévation = MOB-5.5 ; la météo Live = MOB-5.6.

const SEGMENT_KM_EPSILON = 0.001;

/** Segment portant le km cumulé `km` (fallback 1er segment) — pour l'enrichissement popup. */
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

/** Padding bas (px) de l'auto-zoom quand le panneau n'est pas encore mesuré. */
const PANEL_FALLBACK_PADDING = 260;
const PANEL_PADDING_GAP = 16;

export default function LiveScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = (rawId ?? '').trim();
  const { isOnline } = useNetworkStatus();

  const adventure = useAdventure(id);
  const map = useAdventureMap(id);
  const segments = useMemo(() => map.data?.segments ?? [], [map.data]);
  const waypoints = useAdventureWaypoints(segments);
  const traceReady = hasTrace(segments);
  const title = adventure.data?.name ?? t('map.title');
  const paddingTop = insets.top + 12;
  const segmentId = segments[0]?.id;

  const {
    needsConsent,
    permissionDenied,
    backgroundDenied,
    isAcquiring,
    grantConsent,
    openSettings,
    isLiveModeActive,
  } = useLiveMode(waypoints);

  const [refused, setRefused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Section « PROFIL » du panneau Live (MOB-5.4) — état UI-only LOCAL (pas dans le store,
  // parité web) : repliée par défaut (AC2), auto-open au contact slider (AC3), close on
  // RECHERCHER (AC4), toggle manuel via chevron (AC5).
  const [profileOpen, setProfileOpen] = useState(false);
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute);
  const currentPosition = useLiveStore((s) => s.currentPosition);
  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm);
  const speedKmh = useLiveStore((s) => s.speedKmh);
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm);
  const visibleLayers = useMapStore((s) => s.visibleLayers);

  // ── Recherche POI Live (explicite — refetch, AC2) ───────────────────────────
  const {
    pois,
    hasFetched,
    isFetching: poisFetching,
    targetKm,
    isError: poisError,
    refetch: refetchPois,
    canSearch,
  } = useLivePoiSearch({ adventureId: id, segmentId });

  // Refs « latest » : la queryKey change quand le store change (rayon/targetKm) → on
  // appelle le refetch le plus récent (post-render) pour ne pas fetch avec une clé périmée.
  const refetchPoisRef = useRef(refetchPois);
  const canSearchRef = useRef(canSearch);
  useEffect(() => {
    refetchPoisRef.current = refetchPois;
    canSearchRef.current = canSearch;
  });

  const [searchTrigger, setSearchTrigger] = useState(0);
  const handleSearch = useCallback(() => {
    setProfileOpen(false); // Referme la section PROFIL au lancement (FR-LP-004).
    setSearchTrigger((v) => v + 1);
    // Différé d'un tick : React a re-rendu avec le dernier état store → clé à jour.
    setTimeout(() => {
      if (!canSearchRef.current) return;
      void refetchPoisRef.current();
    }, 0);
  }, []);

  // POIs groupés par calque (pins). En Live, l'API filtre déjà par sous-types actifs →
  // pas de re-filtrage d'affichage (parité web : les pins restent jusqu'à la re-recherche).
  const poisByLayer = useMemo(
    () => groupPoisByLayer(pois, visibleLayers),
    [pois, visibleLayers],
  );
  const allPois = useMemo(
    () => Object.values(poisByLayer).flat(),
    [poisByLayer],
  );

  // ── POI sélectionné + popup projeté (overlay RN, pas un Marker — cf. poi-popup) ──
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const selectedPoi = useMemo(
    () => allPois.find((p) => p.id === selectedPoiId) ?? null,
    [allPois, selectedPoiId],
  );
  if (selectedPoiId !== null && !allPois.some((p) => p.id === selectedPoiId)) {
    setSelectedPoiId(null);
  }
  const selectedSegmentId = selectedPoi
    ? findSegmentIdForKm(segments, selectedPoi.distAlongRouteKm)
    : null;

  const mapRef = useRef<MapCanvasHandle>(null);
  const getCamera = useCallback(() => mapRef.current?.getCamera() ?? null, []);
  const getMap = useCallback(() => mapRef.current?.getMap() ?? null, []);
  const handleCloseSheet = useCallback(() => setSelectedPoiId(null), []);

  // Variante d'accès sélectionnée (popup hébergement) — reset à 0 au changement de POI.
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [variantForPoiId, setVariantForPoiId] = useState(selectedPoiId);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );
  const projectingRef = useRef(false);
  if (variantForPoiId !== selectedPoiId) {
    setVariantForPoiId(selectedPoiId);
    setSelectedVariantIndex(0);
    setPopupAnchor(null);
  }

  const reprojectPopup = useCallback(async () => {
    const m = getMap();
    if (!m?.project || !selectedPoi) return;
    if (projectingRef.current) return;
    projectingRef.current = true;
    try {
      const px = await m.project([selectedPoi.lng, selectedPoi.lat]);
      setPopupAnchor({ x: px[0], y: px[1] });
    } catch {
      // Projection indisponible (style pas prêt) → on garde la dernière position connue.
    } finally {
      projectingRef.current = false;
    }
  }, [getMap, selectedPoi]);

  useEffect(() => {
    const m = getMap();
    if (!m?.project || !selectedPoi) return;
    let cancelled = false;
    void m
      .project([selectedPoi.lng, selectedPoi.lat])
      .then((px) => {
        if (!cancelled) setPopupAnchor({ x: px[0], y: px[1] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [getMap, selectedPoi]);

  // Quand la région s'arrête, le projectingRef peut encore être true (onRegionIsChanging
  // a lancé une projection en vol). On le remet à false pour que reprojectPopup capture
  // la position finale de manière fiable.
  const handleRegionDidChange = useCallback(async () => {
    projectingRef.current = false;
    await reprojectPopup();
  }, [reprojectPopup]);

  // ── Cercle de rayon + point cible (AC3) ─────────────────────────────────────
  const targetPoint = useMemo(() => {
    if (targetKm === null || waypoints.length === 0) return null;
    const km = waypoints.map((w) => ({ lat: w.lat, lng: w.lng, km: w.distKm }));
    return findPointAtKm(km, targetKm);
  }, [targetKm, waypoints]);

  // ── Slider max dynamique = distance restante (AC1, parité 16-20) ─────────────
  const maxAheadKm = useMemo(() => {
    if (currentKmOnRoute === null || waypoints.length === 0) return undefined;
    const totalDistKm = waypoints[waypoints.length - 1]!.distKm;
    return Math.max(0, Math.ceil(totalDistKm - currentKmOnRoute));
  }, [currentKmOnRoute, waypoints]);

  // ── Centre du corridor pour « RECHERCHER SUR » (MOB-5.4) ─────────────────────
  // Disponible dès que Live actif + position connue (pas de recherche requise).
  // RGPD : centre de la plage de recherche, jamais la position GPS de l'utilisateur.
  const searchCenter = useMemo(() => {
    if (!isLiveModeActive || targetKm === null || waypoints.length === 0) return null;
    return getCorridorCenter(waypoints, targetKm);
  }, [isLiveModeActive, targetKm, waypoints]);

  // ── Métriques D+/D- de la fenêtre `[currentKm, +targetAheadKm]` (MOB-5.4) ─────
  // Single source (MOB-5.5 / T4, résout l'Open Question 5.4) : `computeWindowElevation`
  // est exposé par le wrapper du profil → la ligne métriques de 5.4 ET le profil
  // partagent le même calcul. RGPD : `currentKmOnRoute` est client-side (snapToTrace).
  const elevation = useMemo(() => {
    if (currentKmOnRoute === null)
      return { gain: null as number | null, loss: null as number | null };
    return computeWindowElevation(
      waypoints,
      currentKmOnRoute,
      currentKmOnRoute + targetAheadKm,
    );
  }, [waypoints, currentKmOnRoute, targetAheadKm]);

  // ── Profil d'élévation Live (MOB-5.5) — gate `hasElevationData` (AC4) ─────────
  // Au moins 2 waypoints à élévation valide → un profil est rendable ; sinon
  // `profileContent` reste `undefined` → la section PROFIL de 5.4 demeure non dépliable
  // (pas de graphe vide, FR-LP-011).
  const showProfile = useMemo(
    () =>
      waypoints.filter((wp) => wp.ele !== null && wp.ele !== undefined).length >= 2,
    [waypoints],
  );
  // Libellé a11y du graphe (D+/D- de la fenêtre — single source ci-dessus).
  const profileA11y = t('live.profile.a11yLabel', {
    dPlus: elevation.gain != null ? Math.round(elevation.gain) : 0,
    dMinus: elevation.loss != null ? Math.round(elevation.loss) : 0,
  });
  // `profileContent` mémoïsé : en mode Live, `LiveScreen` re-rend à chaque tick GPS (~1 Hz
  // via `currentKmOnRoute`). Sans mémo, une nouvelle référence d'élément JSX est créée à
  // chaque render → `LiveControls` (si memoïsé) re-rend systématiquement, et `ElevationChart`
  // recompute `sx`/`tx` à chaque tick même si le domaine n'a pas changé.
  const profileContent = useMemo(
    () =>
      showProfile ? (
        <LiveElevationProfile
          waypoints={waypoints}
          segments={segments}
          currentKmOnRoute={currentKmOnRoute}
          targetAheadKm={targetAheadKm}
          searchRadiusKm={searchRadiusKm}
          accessibilityLabel={profileA11y}
        />
      ) : undefined,
    [showProfile, waypoints, segments, currentKmOnRoute, targetAheadKm, searchRadiusKm, profileA11y],
  );

  // ── Compteur de filtres actifs (badge) ──────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!visibleLayers.has('accommodations')) count++;
    if (visibleLayers.has('restaurants')) count++;
    if (visibleLayers.has('supplies')) count++;
    if (visibleLayers.has('bike')) count++;
    if (searchRadiusKm !== 5) count++;
    if (speedKmh !== 15) count++;
    return count;
  }, [visibleLayers, searchRadiusKm, speedKmh]);

  // ── Auto-zoom sur la zone de recherche, UNE FOIS par recherche (AC3) ─────────
  // Dual-path : cache froid (`poisFetching` true→false) + cache chaud (`searchTrigger`
  // incrémenté sans fetch). ⚠️ Refs de transition mises à jour en FIN d'effet, **sans
  // cleanup-reset** (deps fréquentes ; un reset en cleanup empêcherait le zoom — leçon
  // project-context / régression 2026-06-16). Le fit met `gpsTrackingActive=false`.
  const [panelHeight, setPanelHeight] = useState(0);
  const prevPoisFetchingRef = useRef(false);
  const prevSearchTriggerRef = useRef(0);
  useEffect(() => {
    const justResolved = prevPoisFetchingRef.current && !poisFetching;
    const justSearched =
      searchTrigger > 0 &&
      searchTrigger !== prevSearchTriggerRef.current &&
      !poisFetching &&
      hasFetched;
    if ((justResolved || justSearched) && isLiveModeActive && targetKm !== null) {
      const bounds =
        computeSearchZoneBounds(waypoints, targetKm, searchRadiusKm) ??
        computeTraceBounds(collectTraceWaypoints(segments));
      const bottomPadding =
        (panelHeight > 0 ? panelHeight : PANEL_FALLBACK_PADDING) +
        PANEL_PADDING_GAP;
      mapRef.current?.fitToSearchZone(bounds, bottomPadding);
    }
    prevPoisFetchingRef.current = poisFetching;
    prevSearchTriggerRef.current = searchTrigger;
  }, [
    poisFetching,
    hasFetched,
    isLiveModeActive,
    searchTrigger,
    targetKm,
    searchRadiusKm,
    waypoints,
    segments,
    panelHeight,
  ]);

  // ── États des bannières (précédence : offline > erreur > aucun résultat) ─────
  const showOffline = !isOnline && isLiveModeActive;
  const showUnstable =
    isOnline && isLiveModeActive && poisError && !poisFetching;
  const showNoResults =
    isLiveModeActive &&
    !poisFetching &&
    !poisError &&
    hasFetched &&
    allPois.length === 0 &&
    !showOffline;

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
        onRegionIsChanging={reprojectPopup}
        onRegionDidChange={handleRegionDidChange}
      >
        {/* Cercle de rayon + point cible AVANT les pins → pins au-dessus (AC3). */}
        <LiveSearchZoneLayer center={targetPoint} radiusKm={searchRadiusKm} />
        <PoiLayer
          poisByLayer={poisByLayer}
          visibleLayers={visibleLayers}
          onSelectPoi={setSelectedPoiId}
          getCamera={getCamera}
        />
        {/* Point GPS (dot + halo) à la position courante (MOB-5.2). */}
        <LiveGpsLayer />
      </MapCanvas>

      {/* Popup POI = overlay RN absolu au-dessus de la carte (tactile fiable iOS). */}
      <PoiPopup
        poi={selectedPoi}
        anchor={popupAnchor}
        segmentId={selectedSegmentId}
        onClose={handleCloseSheet}
        getCamera={getCamera}
        getMap={getMap}
        selectedVariantIndex={selectedVariantIndex}
        onSelectVariant={setSelectedVariantIndex}
      />
      {header}

      {/* Bouton « recentrer » (AC5 MOB-5.2). */}
      {isLiveModeActive && currentPosition ? (
        <View
          pointerEvents="box-none"
          style={{ top: insets.top + 64 }}
          className="absolute right-4 z-20"
        >
          <Button
            variant="ghost"
            size="icon"
            className="bg-card/80"
            accessibilityLabel={t('live.recenter')}
            onPress={() => mapRef.current?.centerOnGps()}
          >
            <NavigationIcon size={22} className="text-primary" />
          </Button>
        </View>
      ) : null}

      {/* Indicateur « acquisition GPS… » (NFR-007) — haut, au-dessus du panneau. */}
      {isAcquiring ? (
        <View
          pointerEvents="none"
          style={{ top: insets.top + 64 }}
          className="absolute left-0 right-0 z-20 items-center"
        >
          <View
            accessibilityRole="text"
            className="rounded-full bg-card/90 px-4 py-2"
          >
            <Text className="text-sm font-montserrat text-text-secondary">
              {t('live.gpsAcquiring')}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Overlay de chargement recherche (AC2) — garde paused-safe via `poisFetching`. */}
      {poisFetching ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 z-20 items-center justify-center"
        >
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('pois.search.loading')}
            className="flex-row items-center gap-2 rounded-lg bg-card/90 px-4 py-3"
          >
            <ActivityIndicator size="small" className="text-primary" />
            <Text className="text-sm font-montserrat text-text-primary">
              {t('pois.search.loading')}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Bannière « Connexion instable » (AC6) — POI partiels conservés, non bloquant. */}
      {showUnstable ? (
        <View
          pointerEvents="none"
          style={{ top: insets.top + 56 }}
          className="absolute left-0 right-0 z-40 items-center px-4"
        >
          <View
            accessibilityRole="alert"
            className="rounded-lg bg-text-muted px-4 py-2"
          >
            <Text className="text-center text-sm font-montserrat-semibold text-white">
              {t('live.search.unstableConnection', { count: allPois.length })}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Bannière « Aucun résultat » (AC5) — gate `hasFetched`, jamais `length===0` seul. */}
      <LiveNoResultsBanner visible={showNoResults && !showUnstable} />

      {/* Avis dégradation background (AC6 MOB-5.2) — « Always » refusé, non bloquant. */}
      {backgroundDenied && isLiveModeActive ? (
        <View
          pointerEvents="none"
          style={{ top: insets.top + 108 }}
          className="absolute left-4 right-16 z-10"
        >
          <View
            accessibilityRole="alert"
            className="rounded-lg border border-text-muted bg-text-muted/10 px-3 py-2"
          >
            <Text className="text-center text-xs font-montserrat text-text-muted">
              {t('live.bg.permissionDeniedNotice')}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Panneau de contrôle Live refondu (MOB-5.4) : en-tête PROFIL repliable, slider,
          métriques ↑D+·↓D-·~ETA, RECHERCHER / RECHERCHER SUR. `profileContent` = profil
          d'élévation Live (MOB-5.5) quand des données existent, sinon `undefined` → section
          non dépliable (AC4/AC7) ET FR-LP-012 (le profil ne vit QUE dans la section PROFIL). */}
      {isLiveModeActive && traceReady ? (
        <LiveControls
          onFiltersOpen={() => setFiltersOpen(true)}
          onSearch={handleSearch}
          activeFilterCount={activeFilterCount}
          maxAheadKm={maxAheadKm}
          isOnline={isOnline}
          onHeightChange={setPanelHeight}
          elevationGain={elevation.gain}
          elevationLoss={elevation.loss}
          searchCenter={searchCenter}
          profileOpen={profileOpen}
          onProfileToggle={() => setProfileOpen((v) => !v)}
          onProfileAutoOpen={() => setProfileOpen(true)}
          profileContent={profileContent}
        />
      ) : null}

      {/* Tiroir de filtres Live (persist-on-close, AC7). */}
      <LiveFiltersDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        accommodationPois={poisByLayer.accommodations}
      />

      {/* Permission OS refusée → message + Réglages (AC2). */}
      {permissionDenied ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-0 z-50 items-center justify-center px-8"
        >
          <View className="w-full max-w-md gap-3 rounded-2xl border border-border bg-card p-5">
            <Text className="text-lg font-montserrat-semibold text-text-primary">
              {t('live.permissionDenied.title')}
            </Text>
            <Text className="text-sm font-montserrat text-text-secondary">
              {t('live.permissionDenied.body')}
            </Text>
            <Button
              size="lg"
              label={t('live.permissionDenied.openSettings')}
              onPress={openSettings}
            />
          </View>
        </View>
      ) : null}

      {/* Refus du consentement in-app → message AC1 + re-tenter. */}
      {refused ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-0 z-50 items-center justify-center px-8"
        >
          <View className="w-full max-w-md gap-3 rounded-2xl border border-border bg-card p-5">
            <Text
              accessibilityRole="alert"
              className="text-sm font-montserrat text-text-secondary"
            >
              {t('live.refusedNotice')}
            </Text>
            <Button
              size="lg"
              label={t('live.consent.accept')}
              onPress={() => setRefused(false)}
            />
          </View>
        </View>
      ) : null}

      <GeolocationConsent
        open={needsConsent && !refused}
        onConsent={grantConsent}
        onDismiss={() => setRefused(true)}
      />

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

      {showOffline ? (
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
    </View>
  );
}
