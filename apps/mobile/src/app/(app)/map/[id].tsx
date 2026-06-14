import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapCanvas } from '@/components/map/map-canvas';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { ChevronLeftIcon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdventure } from '@/hooks/use-adventures';
import { isMapParsing, useAdventureMap } from '@/hooks/use-adventure-map';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { hasTrace } from '@/lib/map/maplibre-config';
import { useTranslation } from '@/lib/i18n';

// Écran carte (MOB-4.1). PREMIÈRE vue carte de l'app : affiche la trace GPX sur une
// carte MapLibre Native (Dev Client requis) centrée auto, thème light/dark, attribution
// OSM permanente. Les calques POI/densité/accès/météo arrivent en MOB-4.2→4.8.
//
// `MapCanvas` rend toujours le fond + l'attribution ; cet écran ne fait que router
// les ÉTATS par-dessus (chargement scopé, erreur, vide, tuiles offline) et l'en-tête
// (retour + nom). `id` est durci (leçon MOB-3.2) : falsy → aucune query, état neutre.
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

  const segments = map.data?.segments ?? [];
  const traceReady = hasTrace(segments);
  const title = adventure.data?.name ?? t('map.title');
  const paddingTop = insets.top + 12;

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
      <MapCanvas segments={segments} />
      {header}

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
        // vide « ajoutez un segment GPX » — un segment existe et la trace va apparaître.
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
