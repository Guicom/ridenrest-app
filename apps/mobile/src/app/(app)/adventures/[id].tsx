import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AdventureSegmentResponse } from '@ridenrest/shared';

import {
  GpxUploader,
  type GpxUploaderHandle,
} from '@/components/adventure/gpx-uploader';
import {
  RenameAdventureModal,
  type RenameTarget,
} from '@/components/adventure/rename-adventure-modal';
import {
  RenameSegmentModal,
  type RenameSegmentTarget,
} from '@/components/adventure/rename-segment-modal';
import { SegmentList } from '@/components/adventure/segment-list';
import { StravaImportSheet } from '@/components/adventure/strava-import-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import {
  PencilIcon,
  RouteIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
} from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKm } from '@/lib/format/distance';
import {
  useAdventure,
  useDeleteAdventure,
  useRenameAdventure,
} from '@/hooks/use-adventures';
import {
  useDeleteSegment,
  useRenameSegment,
  useReorderSegments,
  useSegments,
} from '@/hooks/use-segments';
import { useStravaConnection } from '@/hooks/use-strava-connection';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useTranslation } from '@/lib/i18n';

// Écran détail d'aventure (MOB-3.1 squelette → MOB-3.2 segments/upload). Affiche le
// nom + actions (renommer/supprimer), puis la liste des segments GPX, l'uploader et
// la notification in-app de fin de parsing. MOB-3.3 y greffera dates/vitesse/profil.
export default function AdventureDetailScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Connectivité (MOB-3.5 / AC2) : désactive les actions réseau (renommer,
  // supprimer, upload, import) et bascule en lecture seule offline. La trace/POIs
  // cachés restent consultables.
  const { isOnline } = useNetworkStatus();

  const { data, isPending, isError } = useAdventure(id);
  const renameMutation = useRenameAdventure();
  const deleteMutation = useDeleteAdventure();

  // Mutations segments (MOB-3.3). `reorder` est optimiste ; `rename`/`delete`
  // invalident. Toutes exposent `isPending` (anti double-submit + ErrorBanner).
  const reorderSegmentsMutation = useReorderSegments(id);
  const renameSegmentMutation = useRenameSegment(id);
  const deleteSegmentMutation = useDeleteSegment(id);

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [segmentRenameTarget, setSegmentRenameTarget] =
    useState<RenameSegmentTarget | null>(null);

  // Import Strava (MOB-3.4). Détection « connecté » réutilise le hook de MOB-2.4
  // (`['strava-connection']` via `listAccounts`) — aucune détection dupliquée.
  const [stravaImportOpen, setStravaImportOpen] = useState(false);
  const { isConnected: stravaConnected } = useStravaConnection();

  // Notification in-app de fin de parsing (succès). Push natif = hors MVP (archi
  // §Native Capabilities) → bandeau transitoire local + carte qui passe en `done`.
  // L'échec est porté par la carte du segment fautif (ErrorBanner + Réessayer).
  const [parsedMessage, setParsedMessage] = useState<string | null>(null);
  const uploaderRef = useRef<GpxUploaderHandle>(null);

  const onParsed = useCallback(
    (segment: AdventureSegmentResponse) => {
      setParsedMessage(
        t('adventures.segments.parsedSuccess', { name: segment.name }),
      );
    },
    [t],
  );

  const {
    data: segments,
    isPending: segmentsPending,
    isError: segmentsError,
  } = useSegments(id, { onParsed });

  // Notification transitoire : le bandeau succès s'efface seul après ~4s (timer
  // ré-armé à chaque nouveau message, nettoyé au démontage) — pas de bandeau sticky.
  useEffect(() => {
    if (!parsedMessage) return;
    const timer = setTimeout(() => setParsedMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [parsedMessage]);

  const paddingTop = insets.top + 24;

  // --- Actions segment (MOB-3.3 / AC2, AC3) ---

  const handleSegmentReorder = useCallback(
    (orderedIds: string[]) => reorderSegmentsMutation.mutate(orderedIds),
    [reorderSegmentsMutation],
  );

  const handleSegmentRename = useCallback(
    (segment: AdventureSegmentResponse) =>
      setSegmentRenameTarget({ id: segment.id, currentName: segment.name }),
    [],
  );

  // Suppression d'un segment : confirmation native (Alert tolérée pour une action
  // DESTRUCTIVE — distincte d'un affichage d'erreur, lui interdit via Alert).
  const handleSegmentDelete = useCallback(
    (segment: AdventureSegmentResponse) => {
      Alert.alert(
        t('adventures.segments.deleteConfirmTitle', { name: segment.name }),
        t('adventures.segments.deleteConfirmBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => deleteSegmentMutation.mutate(segment.id),
          },
        ],
      );
    },
    [t, deleteSegmentMutation],
  );

  // Remplacement = delete PUIS ré-upload via le `gpx-uploader` existant (pas
  // d'endpoint dédié). Ordre : on supprime d'abord ; au succès du delete, on ouvre
  // le picker (nouveau segment `pending`, appended en fin). En cas d'échec d'upload
  // après delete, l'ErrorBanner de l'uploader surface l'erreur — l'utilisateur
  // peut ré-essayer l'ajout (le segment a déjà été retiré).
  const handleSegmentReplace = useCallback(
    (segment: AdventureSegmentResponse) => {
      Alert.alert(
        t('adventures.segments.replace'),
        t('adventures.segments.deleteConfirmBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('adventures.segments.replace'),
            style: 'destructive',
            onPress: () =>
              deleteSegmentMutation.mutate(segment.id, {
                onSuccess: () => uploaderRef.current?.pick(),
              }),
          },
        ],
      );
    },
    [t, deleteSegmentMutation],
  );

  const confirmDelete = () => {
    if (!data) return;
    Alert.alert(
      t('adventures.delete.confirmTitle', { name: data.name }),
      t('adventures.delete.confirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('adventures.delete.confirm'),
          style: 'destructive',
          onPress: () =>
            deleteMutation.mutate(id, {
              // Au succès, on quitte le détail (l'item n'existe plus).
              onSuccess: () => router.replace('/(app)/adventures'),
            }),
        },
      ],
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background-page"
      contentContainerClassName="gap-6 p-6"
      contentContainerStyle={{ paddingTop }}
    >
      <View className="flex-row items-center justify-between">
        <Button
          variant="link"
          size="sm"
          className="px-0"
          label={t('settings.back')}
          onPress={() => router.back()}
        />
      </View>

      {isPending ? (
        <View className="gap-3">
          <Skeleton className="h-8 w-2/3 rounded-lg" />
          <Skeleton className="h-20 rounded-xl" />
        </View>
      ) : isError || !data ? (
        <ErrorBanner message={t('adventures.errors.loadFailed')} />
      ) : (
        <>
          <Text className="text-2xl font-montserrat-bold text-text-primary">
            {data.name}
          </Text>

          {/* Stats de l'aventure (parité web mobile) : distance totale + D+/D-,
              valeurs SERVEUR (`totalDistanceKm`/`totalElevationGainM/LossM`),
              jamais recalculées. D+/D- omis si la donnée est absente. */}
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <View className="flex-row items-center gap-1.5">
              <RouteIcon size={16} className="text-text-muted" />
              <Text className="text-sm font-montserrat text-text-muted">
                {t('adventures.segments.distanceKm', {
                  value: formatKm(data.totalDistanceKm, locale),
                })}
              </Text>
            </View>
            {data.totalElevationGainM != null ? (
              <View className="flex-row items-center gap-1.5">
                <TrendingUpIcon size={16} className="text-text-muted" />
                <Text className="text-sm font-montserrat text-text-muted">
                  {t('adventures.segments.gainDPlus', {
                    value: Math.round(data.totalElevationGainM),
                  })}
                </Text>
              </View>
            ) : null}
            {data.totalElevationLossM != null ? (
              <View className="flex-row items-center gap-1.5">
                <TrendingDownIcon size={16} className="text-text-muted" />
                <Text className="text-sm font-montserrat text-text-muted">
                  {t('adventures.segments.lossDMinus', {
                    value: Math.round(data.totalElevationLossM),
                  })}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Lecture seule offline (MOB-3.5 / AC2) : message explicite + actions
              réseau désactivées. La trace/POIs cachés restent consultables. */}
          {!isOnline ? (
            <View
              accessibilityRole="alert"
              className="rounded-lg border border-text-muted bg-text-muted/10 px-3 py-2"
            >
              <Text className="text-sm font-montserrat text-text-muted">
                {t('offline.readOnly')}
              </Text>
            </View>
          ) : null}

          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={!isOnline}
              accessibilityLabel={t('adventures.card.renameA11y')}
              accessibilityHint={
                !isOnline ? t('offline.actionUnavailable') : undefined
              }
              onPress={() =>
                setRenameTarget({ id: data.id, currentName: data.name })
              }
            >
              <View className="flex-row items-center gap-2">
                <PencilIcon size={18} className="text-foreground" />
                <Text className="text-sm font-montserrat-semibold text-foreground">
                  {t('common.rename')}
                </Text>
              </View>
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!isOnline}
              loading={deleteMutation.isPending}
              accessibilityLabel={t('adventures.card.deleteA11y')}
              accessibilityHint={
                !isOnline ? t('offline.actionUnavailable') : undefined
              }
              onPress={confirmDelete}
            >
              <View className="flex-row items-center gap-2">
                <Trash2Icon size={18} className="text-white" />
                <Text className="text-sm font-montserrat-semibold text-white">
                  {t('common.delete')}
                </Text>
              </View>
            </Button>
          </View>

          {renameMutation.isError ? (
            <ErrorBanner message={t('adventures.errors.renameFailed')} />
          ) : null}
          {deleteMutation.isError ? (
            <ErrorBanner message={t('adventures.errors.deleteFailed')} />
          ) : null}

          {/* Section segments GPX (MOB-3.2). */}
          <View className="gap-3">
            <Text className="text-lg font-montserrat-semibold text-text-primary">
              {t('adventures.segments.title')}
            </Text>

            {/* Notification in-app de fin de parsing (succès). */}
            {parsedMessage ? (
              <View
                accessibilityRole="alert"
                className="rounded-lg border border-primary bg-primary/10 px-3 py-2"
              >
                <Text className="text-sm font-montserrat text-primary">
                  {parsedMessage}
                </Text>
              </View>
            ) : null}

            {/* Erreurs de mutation segment (réordre/rename/delete) — inline,
                jamais via Alert. */}
            {reorderSegmentsMutation.isError ? (
              <ErrorBanner message={t('adventures.segments.errors.reorder')} />
            ) : null}
            {renameSegmentMutation.isError ? (
              <ErrorBanner message={t('adventures.segments.errors.rename')} />
            ) : null}
            {deleteSegmentMutation.isError ? (
              <ErrorBanner message={t('adventures.segments.errors.delete')} />
            ) : null}

            {segmentsPending ? (
              <View className="gap-3">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </View>
            ) : segmentsError ? (
              <ErrorBanner message={t('adventures.segments.loadFailed')} />
            ) : segments && segments.length > 0 ? (
              <SegmentList
                adventureId={id}
                segments={segments}
                onReorder={handleSegmentReorder}
                onRename={handleSegmentRename}
                onDelete={handleSegmentDelete}
                onReplace={handleSegmentReplace}
                isReordering={
                  reorderSegmentsMutation.isPending ||
                  deleteSegmentMutation.isPending
                }
              />
            ) : (
              <Card>
                <Text className="text-sm font-montserrat text-text-muted">
                  {t('adventures.segments.empty')}
                </Text>
              </Card>
            )}

            {/* Actions réseau (upload / import Strava) : masquées offline — la
                trace cachée reste consultable, mais on ne peut plus muter (AC2). */}
            {isOnline ? (
              <>
                <GpxUploader
                  ref={uploaderRef}
                  adventureId={id}
                  onUploaded={() => setParsedMessage(null)}
                />

                {/* Import d'itinéraires Strava (MOB-3.4) — à côté de l'uploader GPX. */}
                <Button
                  variant="outline"
                  label={t('strava.import.openButton')}
                  onPress={() => setStravaImportOpen(true)}
                />
              </>
            ) : null}
          </View>
        </>
      )}

      <StravaImportSheet
        adventureId={id}
        open={stravaImportOpen}
        onClose={() => setStravaImportOpen(false)}
        stravaConnected={stravaConnected}
      />

      <RenameAdventureModal
        target={renameTarget}
        isPending={renameMutation.isPending}
        onClose={() => setRenameTarget(null)}
        onSubmit={(targetId, name) =>
          renameMutation.mutate(
            { id: targetId, name },
            { onSuccess: () => setRenameTarget(null) },
          )
        }
      />

      <RenameSegmentModal
        target={segmentRenameTarget}
        isPending={renameSegmentMutation.isPending}
        onClose={() => setSegmentRenameTarget(null)}
        onSubmit={(segmentId, name) =>
          renameSegmentMutation.mutate(
            { segmentId, name },
            { onSuccess: () => setSegmentRenameTarget(null) },
          )
        }
      />
    </ScrollView>
  );
}
