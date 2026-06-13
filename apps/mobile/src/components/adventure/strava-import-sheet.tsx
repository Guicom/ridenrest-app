import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoweredByStrava } from '@/components/shared/powered-by-strava';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  isStravaNotConnectedError,
  mapStravaError,
  stravaRoutesKey,
  useImportStravaRoute,
  useStravaRoutes,
  type StravaRouteItem,
} from '@/hooks/use-strava';
import { useTranslation } from '@/lib/i18n';

import { StravaActivityRow } from './strava-activity-row';

// Sheet d'import d'itinéraires (routes) Strava (MOB-3.4 / AC1, AC2, AC4, AC5, AC6).
// Implémentée en `<Modal>` RN plein écran (`animationType="slide"`) — pas de lib de
// bottom-sheet pour éviter une dépendance native (décision documentée story).
//
// Lazy : `useStravaRoutes` n'est `enabled` que si la sheet est ouverte ET connecté
// (économise le rate-limit Strava). Pagination page-based : « Charger plus »
// incrémente `page`, on concatène les pages côté composant.
//
// PAS de polling propre : la mutation d'import invalide la query segments (MOB-3.2)
// → le polling existant fait évoluer le badge `pending → done/error`.

const PAGE_SIZE = 30; // ≤ 30 routes/page (per_page serveur). < 30 ⇒ dernière page.

export interface StravaImportSheetProps {
  adventureId: string;
  open: boolean;
  onClose: () => void;
  onImportStarted?: () => void;
  /** Dérivé de `useStravaConnection().isConnected` (MOB-2.4). Pilote l'état/lazy. */
  stravaConnected: boolean;
}

export function StravaImportSheet({
  adventureId,
  open,
  onClose,
  onImportStarted,
  stravaConnected,
}: StravaImportSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  // ID de la route en cours d'import (anti-double-submit ciblé sur la ligne).
  const [importingId, setImportingId] = useState<string | null>(null);

  // Lazy : déclenché QUE quand la sheet est ouverte ET connectée (AC1, AC4).
  const enabled = open && stravaConnected;
  const routesQuery = useStravaRoutes(page, { enabled });
  const importMutation = useImportStravaRoute(adventureId);

  const pageData = routesQuery.data;

  // Concaténation page-based DÉRIVÉE (pas d'état/effet → ni cascade ni setState en
  // rendu, lint `set-state-in-effect`) : on relit les pages 1..`page` déjà mises en
  // cache par TanStack Query et on les fusionne (dédupe par id). `pageData` est dans
  // les deps pour recalculer dès qu'une nouvelle page arrive dans le cache.
  const routes = useMemo(
    () => {
      const byId = new Map<string, StravaRouteItem>();
      for (let p = 1; p <= page; p += 1) {
        const cached = queryClient.getQueryData<StravaRouteItem[]>(
          stravaRoutesKey(p),
        );
        cached?.forEach((r) => byId.set(r.id, r));
      }
      return Array.from(byId.values());
    },
    // `pageData` (résultat de la query page courante) n'est PAS lu dans le calcul
    // mais sert de déclencheur : quand une nouvelle page arrive en cache, il change
    // → le memo relit `getQueryData` à jour. ESLint le croit superflu (il ne suit pas
    // `getQueryData`), d'où le disable ciblé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageData, queryClient],
  );

  const reset = useCallback(() => {
    setPage(1);
    setImportingId(null);
    importMutation.reset();
  }, [importMutation]);

  const handleClose = useCallback((force = false) => {
    if (!force && importMutation.isPending) return;
    reset();
    onClose();
  }, [importMutation.isPending, reset, onClose]);

  const handleImport = useCallback(
    (stravaRouteId: string) => {
      if (importMutation.isPending) return; // anti-double-submit global (AC6).
      setImportingId(stravaRouteId);
      importMutation.mutate(
        { stravaRouteId },
        {
          onSuccess: () => {
            onImportStarted?.();
            handleClose(true); // ferme la sheet (le polling MOB-3.2 prend le relais).
          },
          onError: () => setImportingId(null),
        },
      );
    },
    [importMutation, handleClose, onImportStarted],
  );

  const goToSettings = useCallback(() => {
    onClose();
    // Écran settings de MOB-2.4 (`src/app/(app)/settings.tsx`) hébergeant la carte
    // de connexion Strava (`<StravaConnectionCard>`).
    router.push('/(app)/settings');
  }, [onClose]);

  // Une page pleine (= PAGE_SIZE) ⇒ il peut y avoir une page suivante. Pendant le
  // chargement/erreur d'une page > 1, on garde le CTA visible pour montrer le loading
  // puis permettre un retry de la même page sans devoir fermer/réouvrir la sheet.
  const hasMore =
    (page > 1 && (routesQuery.isPending || routesQuery.isError)) ||
    (pageData?.length ?? 0) >= PAGE_SIZE;
  const isLoadingFirstPage = routesQuery.isPending && routes.length === 0;
  const listError = routesQuery.error;
  // Un 404 sur le listing = token Strava absent → on bascule sur l'état « non
  // connecté » (fallback dégradé robuste, plutôt qu'un ErrorBanner).
  const listSaysNotConnected =
    listError != null && isStravaNotConnectedError(listError);
  const showNotConnected = !stravaConnected || listSaysNotConnected;

  // Message d'erreur affichable : erreur de listing (hors 404) OU erreur d'import.
  const bannerError =
    importMutation.error ??
    (listError && !listSaysNotConnected ? listError : null);
  const bannerMessage = bannerError ? t(mapStravaError(bannerError)) : null;

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={() => handleClose()}
    >
      <View
        className="flex-1 bg-background-page"
        style={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-center justify-between px-6 pb-2">
          <Text className="text-xl font-montserrat-bold text-text-primary">
            {t('strava.import.title')}
          </Text>
          <Button
            variant="link"
            size="sm"
            className="px-0"
            label={t('common.cancel')}
            disabled={importMutation.isPending}
            onPress={() => handleClose()}
          />
        </View>

        {showNotConnected ? (
          // --- État « non connecté » (AC4) : aucun appel routes monté côté connecté
          // (enabled=false) ; CTA vers les paramètres. ---
          <View className="gap-3 px-6 pt-4">
            <Text className="text-lg font-montserrat-semibold text-text-primary">
              {t('strava.import.notConnected.title')}
            </Text>
            <Text className="text-sm font-montserrat text-text-muted">
              {t('strava.import.notConnected.message')}
            </Text>
            <Button
              label={t('strava.import.notConnected.cta')}
              onPress={goToSettings}
            />
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-3 px-6 pb-10 pt-2"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          >
            {bannerMessage ? <ErrorBanner message={bannerMessage} /> : null}

            {isLoadingFirstPage ? (
              // Loading 1re page → 3 skeletons.
              <View className="gap-3">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </View>
            ) : routes.length === 0 ? (
              <Card>
                <Text className="text-sm font-montserrat text-text-muted">
                  {t('strava.import.empty')}
                </Text>
              </Card>
            ) : (
              <>
                {routes.map((route) => (
                  <StravaActivityRow
                    key={route.id}
                    route={route}
                    importing={importingId === route.id}
                    disabled={importMutation.isPending}
                    onImport={() => handleImport(route.id)}
                  />
                ))}

                {hasMore ? (
                  <Button
                    variant="outline"
                    label={t('strava.import.loadMore')}
                    loading={routesQuery.isFetching}
                    onPress={() => {
                      if (routesQuery.isError) void routesQuery.refetch();
                      else setPage((p) => p + 1);
                    }}
                  />
                ) : null}
              </>
            )}

            {/* Attribution « Powered by Strava » dès que la liste est visible (AC3). */}
            {routes.length > 0 ? (
              <View className="mt-2 flex-row justify-center">
                <PoweredByStrava height={16} />
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
