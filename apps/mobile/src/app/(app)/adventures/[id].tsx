import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
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
  MapIcon,
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
  useUploadSegment,
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
  const uploadReplacementMutation = useUploadSegment(id);

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [segmentRenameTarget, setSegmentRenameTarget] =
    useState<RenameSegmentTarget | null>(null);
  const [replaceError, setReplaceError] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);

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

  // Remplacement = sélection/upload du nouveau GPX PUIS suppression de l'ancien et
  // reorder du nouveau segment à l'emplacement remplacé. On ne supprime jamais
  // l'ancien segment avant que le nouveau fichier soit effectivement uploadé.
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
            onPress: async () => {
              setReplaceError(false);
              const file = await uploaderRef.current?.pickFile();
              if (!file) return;

              setIsReplacing(true);
              try {
                const newSegment =
                  await uploadReplacementMutation.mutateAsync({ file });
                const currentSegments = segments ?? [];
                const orderedIds = currentSegments.map((s) =>
                  s.id === segment.id ? newSegment.id : s.id,
                );
                if (!orderedIds.includes(newSegment.id)) {
                  orderedIds.push(newSegment.id);
                }

                await deleteSegmentMutation.mutateAsync(segment.id);
                await reorderSegmentsMutation.mutateAsync(orderedIds);
                setParsedMessage(null);
              } catch {
                setReplaceError(true);
              } finally {
                setIsReplacing(false);
              }
            },
          },
        ],
      );
    },
    [
      t,
      segments,
      deleteSegmentMutation,
      reorderSegmentsMutation,
      uploadReplacementMutation,
    ],
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

  // En-tête défilant (parité web : tout défile). Rendu par `ListHeaderComponent` de
  // la liste réordonnable. `data` est garanti non-null dans la branche d'affichage.
  const header = data ? (
    <View className="gap-4 pb-1">
      <Button
        variant="link"
        size="sm"
        className="self-start px-0"
        label={t('settings.back')}
        onPress={() => router.back()}
      />

      {/* Titre + crayon de renommage (parité web : icône à côté du titre). */}
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-2xl font-montserrat-bold text-text-primary">
          {data.name}
        </Text>
        <Button
          variant="ghost"
          size="icon"
          disabled={!isOnline}
          accessibilityLabel={t('adventures.card.renameA11y')}
          accessibilityHint={
            !isOnline ? t('offline.actionUnavailable') : undefined
          }
          onPress={() =>
            setRenameTarget({ id: data.id, currentName: data.name })
          }
        >
          <PencilIcon size={20} className="text-text-primary" />
        </Button>
      </View>

      {/* Stats aventure (parité web) : distance + D+ · D-, valeurs SERVEUR. */}
      <View className="flex-row flex-wrap items-center gap-4">
        <View className="flex-row items-center gap-1">
          <RouteIcon size={16} className="text-text-muted" />
          <Text className="text-sm font-montserrat text-text-muted">
            {t('adventures.segments.distanceKm', {
              value: formatKm(data.totalDistanceKm, locale),
            })}
          </Text>
        </View>
        {data.totalElevationGainM != null ||
        data.totalElevationLossM != null ? (
          <View className="flex-row items-center gap-1">
            {data.totalElevationGainM != null ? (
              <>
                <TrendingUpIcon size={16} className="text-text-muted" />
                <Text className="text-sm font-montserrat text-text-muted">
                  {t('adventures.segments.gainDPlus', {
                    value: Math.round(data.totalElevationGainM),
                  })}
                </Text>
              </>
            ) : null}
            {data.totalElevationGainM != null &&
            data.totalElevationLossM != null ? (
              <Text className="mx-0.5 text-sm font-montserrat text-text-muted">
                ·
              </Text>
            ) : null}
            {data.totalElevationLossM != null ? (
              <>
                <TrendingDownIcon size={16} className="text-text-muted" />
                <Text className="text-sm font-montserrat text-text-muted">
                  {t('adventures.segments.lossDMinus', {
                    value: Math.round(data.totalElevationLossM),
                  })}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* CTA « Voir sur la carte » (MOB-4.1) → carte interactive de l'aventure.
          Disponible online ET offline (la trace cachée reste consultable). */}
      <Button
        variant="outline"
        size="lg"
        className="rounded-full !border-primary/30 active:bg-primary/10"
        textClassName="text-primary"
        onPress={() => router.push(`/(app)/map/${data.id}`)}
      >
        <View className="flex-row items-center gap-2">
          <MapIcon size={18} className="text-primary" />
          <Text className="text-sm font-montserrat-semibold text-primary">
            {t('map.openButton')}
          </Text>
        </View>
      </Button>

      {/* Lecture seule offline (MOB-3.5 / AC2). */}
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

      {renameMutation.isError ? (
        <ErrorBanner message={t('adventures.errors.renameFailed')} />
      ) : null}

      {/* Section « Segments » : titre + feedback + CTAs (au-dessus de la liste). */}
      <View className="gap-3">
        <Text className="text-lg font-montserrat-semibold text-text-primary">
          {t('adventures.segments.title')}
        </Text>

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

        {reorderSegmentsMutation.isError ? (
          <ErrorBanner message={t('adventures.segments.errors.reorder')} />
        ) : null}
        {renameSegmentMutation.isError ? (
          <ErrorBanner message={t('adventures.segments.errors.rename')} />
        ) : null}
        {deleteSegmentMutation.isError && !replaceError ? (
          <ErrorBanner message={t('adventures.segments.errors.delete')} />
        ) : null}
        {replaceError || uploadReplacementMutation.isError ? (
          <ErrorBanner message={t('adventures.segments.errors.replace')} />
        ) : null}

        {isOnline ? (
          <>
            {/* Parité web : pill outline (bordure verte) + pill ghost vert. */}
            <Button
              variant="outline"
              size="lg"
              className="rounded-full !border-primary/30 px-6 active:bg-primary/10"
              textClassName="text-primary"
              label={t('strava.import.openButton')}
              onPress={() => setStravaImportOpen(true)}
            />
            <GpxUploader
              ref={uploaderRef}
              adventureId={id}
              onUploaded={() => setParsedMessage(null)}
            />
          </>
        ) : null}
      </View>
    </View>
  ) : null;

  // Pied défilant : « Supprimer l'aventure » (rouge clair), en fin de liste.
  const footer = data ? (
    <View className="gap-2 pt-3">
      {deleteMutation.isError ? (
        <ErrorBanner message={t('adventures.errors.deleteFailed')} />
      ) : null}
      <Button
        variant="ghost"
        className="bg-destructive/10 active:bg-destructive/20"
        textClassName="text-destructive"
        disabled={!isOnline}
        loading={deleteMutation.isPending}
        label={t('adventures.delete.button')}
        accessibilityHint={
          !isOnline ? t('offline.actionUnavailable') : undefined
        }
        onPress={confirmDelete}
      >
        {deleteMutation.isPending ? undefined : (
          <View className="flex-row items-center gap-2">
            <Trash2Icon size={18} className="text-destructive" />
            <Text className="text-sm font-montserrat-semibold text-destructive">
              {t('adventures.delete.button')}
            </Text>
          </View>
        )}
      </Button>
    </View>
  ) : null;

  // État de la liste de segments (loading / erreur / vide) rendu via ListEmptyComponent.
  const listEmpty = segmentsPending ? (
    <View className="gap-3">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </View>
  ) : segmentsError ? (
    <ErrorBanner message={t('adventures.segments.loadFailed')} />
  ) : (
    <Card>
      <Text className="text-sm font-montserrat text-text-muted">
        {t('adventures.segments.empty')}
      </Text>
    </Card>
  );

  return (
    <View className="flex-1 bg-background-page">
      {isPending ? (
        <View className="gap-3 px-6" style={{ paddingTop }}>
          <Skeleton className="h-8 w-2/3 rounded-lg" />
          <Skeleton className="h-20 rounded-xl" />
        </View>
      ) : isError || !data ? (
        <View className="px-6" style={{ paddingTop }}>
          <ErrorBanner message={t('adventures.errors.loadFailed')} />
        </View>
      ) : (
        // La liste réordonnable EST le scroller de l'écran (FlatList) : en-tête, CTAs
        // et pied défilent avec elle (ListHeader/Footer), et le drag (appui long sur
        // la poignée) coexiste avec le scroll sans conflit (auto-scroll géré par la lib).
        <SegmentList
          adventureId={id}
          segments={segments ?? []}
          onReorder={handleSegmentReorder}
          onRename={handleSegmentRename}
          onDelete={handleSegmentDelete}
          onReplace={handleSegmentReplace}
          isReordering={
            reorderSegmentsMutation.isPending ||
            deleteSegmentMutation.isPending ||
            isReplacing ||
            uploadReplacementMutation.isPending
          }
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={{
            paddingTop,
            paddingHorizontal: 24,
            paddingBottom: 24,
          }}
        />
      )}

      <StravaImportSheet
        adventureId={id}
        open={stravaImportOpen}
        onClose={() => setStravaImportOpen(false)}
        onImportStarted={() => setParsedMessage(t('strava.import.successToast'))}
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
    </View>
  );
}
