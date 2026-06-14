import type { MapSegmentData } from '@ridenrest/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LayerToggles } from '@/components/map/layer-toggles';
import { MapCanvas, type MapCanvasHandle } from '@/components/map/map-canvas';
import { PoiLayer } from '@/components/map/poi-layer';
import { PoiPopup } from '@/components/map/poi-popup';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { ChevronLeftIcon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdventure } from '@/hooks/use-adventures';
import { isMapParsing, useAdventureMap } from '@/hooks/use-adventure-map';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { usePoiLayers } from '@/hooks/use-poi-layers';
import { usePois } from '@/hooks/use-pois';
import { hasTrace } from '@/lib/map/maplibre-config';
import { useTranslation } from '@/lib/i18n';

// Écran carte (MOB-4.1 + calques POI MOB-4.2). Affiche la trace GPX (MapLibre Native)
// + les **calques POI** (toggles indépendants), les **pins/clusters** et la **fiche
// détail** en **popin « liquid glass »** ancrée au pin (`PoiPopup`, parité web). Le
// slider corridor + gate `searchCommitted` arrivent en MOB-4.3 : ici, déclenchement
// **minimal** (plage par défaut 0–15 km, calque `accommodations` actif) dès trace prête.
//
// `MapCanvas` rend le fond + l'attribution + (via `children`) les calques POI ; cet
// écran route les ÉTATS par-dessus (chargement, erreur, vide, tuiles offline), l'en-tête
// et les overlays (toggles, sheet). `id` est durci (leçon MOB-3.2) : falsy → aucune query.

// Plage de recherche POI par défaut (MOB-4.2). MOB-4.3 branchera le slider `fromKm/toKm`.
const DEFAULT_FROM_KM = 0;
const DEFAULT_TO_KM = 15;
// Tolérance float aux jonctions de segments (1 m) — évite un POI exactement à la jonction
// d'être attribué au mauvais segment à cause du drift flottant serveur.
const SEGMENT_KM_EPSILON = 0.001;

/** Segment d'origine d'un POI (par km le long de la trace) — pour l'enrichissement Google. */
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

export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // `id` durci (leçon MOB-3.2) + trim : un id blanc (`" "`, deep link `map/%20`)
  // passerait `!id` et `Boolean(id)` → on le normalise pour qu'il retombe falsy.
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = (rawId ?? '').trim();
  const { isOnline } = useNetworkStatus();

  const adventure = useAdventure(id);
  const map = useAdventureMap(id);

  const segments = useMemo(() => map.data?.segments ?? [], [map.data]);
  const traceReady = hasTrace(segments);
  const title = adventure.data?.name ?? t('map.title');
  const paddingTop = insets.top + 12;

  // Modèle de calques (défaut `accommodations`) + POIs corridor (déclenchement minimal).
  const { visibleLayers, toggleLayer } = usePoiLayers();
  const { poisByLayer, pois } = usePois({
    adventureId: id,
    segments,
    visibleLayers,
    fromKm: DEFAULT_FROM_KM,
    toKm: DEFAULT_TO_KM,
    enabled: traceReady,
  });

  // POI sélectionné (lifté à la route — alimente le sheet + le recentrage caméra).
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const selectedPoi = useMemo(
    () => pois.find((p) => p.id === selectedPoiId) ?? null,
    [pois, selectedPoiId],
  );
  const selectedSegmentId = selectedPoi
    ? findSegmentIdForKm(segments, selectedPoi.distAlongRouteKm)
    : null;

  const mapRef = useRef<MapCanvasHandle>(null);
  const getCamera = useCallback(() => mapRef.current?.getCamera() ?? null, []);
  // Accès carte (projection) : le recentrage de la fiche préserve le zoom courant.
  const getMap = useCallback(() => mapRef.current?.getMap() ?? null, []);
  const handleCloseSheet = useCallback(() => setSelectedPoiId(null), []);

  // Désélectionne automatiquement si le POI sélectionné disparaît de `pois`
  // (ex. calque togglé off) — évite que la popup rouvre au re-toggle.
  useEffect(() => {
    if (!selectedPoiId) return;
    if (pois.some((p) => p.id === selectedPoiId)) return;
    setSelectedPoiId(null);
  }, [pois, selectedPoiId]);

  // En-tête flottant (retour + nom), pastilles `bg-card/80` lisibles sur la carte.
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

  // Edge : `id` falsy → hooks désactivés (pas d'appel `/adventures/undefined/map`),
  // état neutre sans carte (évite un skeleton infini).
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
      <MapCanvas ref={mapRef} segments={segments}>
        {/* Calques POI + fiche détail insérés DANS le `<Map>` (MOB-4.2). La popin est
            un `Marker` natif ancré au pin → elle suit la carte sans projection JS. */}
        <PoiLayer
          poisByLayer={poisByLayer}
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

      {/* Toggles de calque (overlay bas, au-dessus de l'attribution) — visibles dès
          que la trace est prête. La popin POI est un `Marker` natif sur la carte (pas un
          overlay RN), donc aucun conflit de z-index avec ces toggles. */}
      {traceReady ? (
        <View
          pointerEvents="box-none"
          style={{ bottom: insets.bottom + 16 }}
          className="absolute left-0 right-0 z-10 items-center px-4"
        >
          <LayerToggles visibleLayers={visibleLayers} onToggle={toggleLayer} />
        </View>
      ) : null}

      {/* Tuiles indisponibles hors-ligne (AC5) — informatif, non bloquant. */}
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

      {/* États carte superposés et centrés (scopés, jamais plein écran bloquant).
          Le fond de carte + l'attribution restent visibles dessous (AC4).
          `fetchStatus !== 'paused'` : hors-ligne sans cache, la query reste `paused`
          (networkMode `online`) avec `status: 'pending'` → sans ce garde, le skeleton
          tournerait à l'infini (AC5). En `paused`/sans données on retombe sur l'état
          vide (+ bandeau tuiles offline). */}
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
        // Segment(s) en cours de parsing (polling 3 s actif) : ne PAS afficher l'état
        // vide « ajoutez un segment » — un segment existe et la trace va apparaître.
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
