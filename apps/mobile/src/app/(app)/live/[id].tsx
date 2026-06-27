import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GeolocationConsent } from '@/components/live/geolocation-consent';
import { MapCanvas } from '@/components/map/map-canvas';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { ChevronLeftIcon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdventure } from '@/hooks/use-adventures';
import { isMapParsing, useAdventureMap } from '@/hooks/use-adventure-map';
import { useAdventureWaypoints } from '@/hooks/use-adventure-waypoints';
import { useLiveMode } from '@/hooks/use-live-mode';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { hasTrace } from '@/lib/map/maplibre-config';
import { useLiveStore } from '@/lib/stores/live.store';
import { useTranslation } from '@/lib/i18n';

// Écran Live (MOB-5.1 / T5 — SHELL FONDATION). Carte plein écran + trace (réutilise
// `MapCanvas` MOB-4.1) + flow de consentement RGPD + permission foreground + suivi GPS
// foreground (projeté client-side sur la trace → `currentKmOnRoute`). Le keep-awake est
// porté par `live/_layout.tsx`.
//
// Hors scope ici (stories suivantes) : background GPS écran-éteint / caméra auto-follow /
// dot GPS (5.2), découverte POI (5.3), panneau de recherche (5.4), profil d'élévation
// (5.5), météo (5.6). On affiche juste un repère minimal du PK courant pour matérialiser
// la projection (AC3) sans préempter le rendu du dot/caméra de 5.2.
//
// RGPD : aucun appel serveur GPS — la position reste sur le device (NFR-LP-001).

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

  const { needsConsent, permissionDenied, grantConsent, openSettings, isLiveModeActive } =
    useLiveMode(waypoints);

  // Refus du consentement in-app : on ferme le dialog et on affiche le message AC1
  // (la géoloc est nécessaire) avec une action pour re-tenter. Le mode Live n'est PAS activé.
  const [refused, setRefused] = useState(false);
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute);

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
      <MapCanvas segments={segments} />
      {header}

      {/* Repère minimal du PK courant (matérialise la projection AC3 ; dot/caméra = 5.2). */}
      {isLiveModeActive && currentKmOnRoute != null ? (
        <View
          pointerEvents="none"
          style={{ bottom: insets.bottom + 16 }}
          className="absolute left-0 right-0 z-20 items-center"
        >
          <View
            accessibilityRole="text"
            accessibilityLabel={`${currentKmOnRoute.toFixed(1)} km`}
            className="rounded-full bg-primary/90 px-4 py-2"
          >
            <Text className="text-sm font-montserrat-semibold text-white">
              {`${currentKmOnRoute.toFixed(1)} km`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Permission OS refusée → message + Réglages (jamais de cul-de-sac, AC2). */}
      {permissionDenied ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-0 z-30 items-center justify-center px-8"
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
          className="absolute inset-0 z-30 items-center justify-center px-8"
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

      {/* Dialog de consentement RGPD (non-dismissible). Modal RN → overlay au-dessus de tout. */}
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
    </View>
  );
}
