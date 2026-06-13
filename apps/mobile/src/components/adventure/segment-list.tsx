import { useCallback, type ReactElement } from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import type { AdventureSegmentResponse } from '@ridenrest/shared';

import { Card } from '@/components/ui/card';
import {
  GripVerticalIcon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
} from '@/components/ui/icon';
import { SegmentStatusBadge } from '@/components/adventure/segment-status-badge';
import { formatKm } from '@/lib/format/distance';
import { useTranslation } from '@/lib/i18n';

// Liste RÉORDONNABLE de segments + distances (MOB-3.3 / T4, AC1 & AC4).
//
// On utilise `react-native-reorderable-list` (basé sur FlatList, Reanimated 4 + New
// Arch) plutôt qu'une lib de drag « conteneur » : c'est LA liste scrollable de
// l'écran. L'en-tête (titre, stats, CTAs) et le pied (« Supprimer ») passent par
// `ListHeaderComponent` / `ListFooterComponent` → ils DÉFILENT avec la liste (UX
// mobile standard), et le drag fonctionne sans conflit avec le scroll : il s'active
// par APPUI LONG sur la poignée (auto-scroll géré par la lib).
//
// - À la fin du drag, `onReorder` expose `{ from, to }` → `reorderItems` reconstruit
//   l'ordre, on en extrait `orderedIds` et on appelle `onReorder` (→ mutation
//   optimiste côté écran).
// - Distances issues du SERVEUR uniquement (`cumulativeStartKm`/`distanceKm`/
//   `totalDistanceKm`) — JAMAIS recalculées ici ; seul `formatKm` (T6) formate.
//   Segment non `done` → libellé « Analyse en cours… ».
// - Toutes les chaînes via `t()` ; actions désactivées pendant une mutation
//   (`isReordering`) pour éviter le double-déclenchement (AC5).

export interface SegmentListProps {
  adventureId: string;
  segments: AdventureSegmentResponse[];
  onReorder: (orderedIds: string[]) => void;
  onRename: (segment: AdventureSegmentResponse) => void;
  onDelete: (segment: AdventureSegmentResponse) => void;
  onReplace: (segment: AdventureSegmentResponse) => void;
  /** Mutation reorder en vol → désactive les actions (anti double-submit, AC5). */
  isReordering?: boolean;
  /** En-tête défilant (titre, stats, CTAs…) rendu en tête de liste. */
  ListHeaderComponent?: ReactElement | null;
  /** Pied défilant (ex. « Supprimer l'aventure ») rendu en fin de liste. */
  ListFooterComponent?: ReactElement | null;
  /** Affiché à la place des items quand `segments` est vide (loading/erreur/vide). */
  ListEmptyComponent?: ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Formate le dénivelé d'un segment au format web mobile : « 527 m D+ · 1013 m D- »
 * (valeurs serveur, arrondies). Omet une part si la donnée est absente (`null`).
 */
function formatElevationDelta(
  gainM: number | null,
  lossM: number | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const parts: string[] = [];
  if (gainM != null) {
    parts.push(t('adventures.segments.gainDPlus', { value: Math.round(gainM) }));
  }
  if (lossM != null) {
    parts.push(t('adventures.segments.lossDMinus', { value: Math.round(lossM) }));
  }
  return parts.join(' · ');
}

export function SegmentList({
  segments,
  onReorder,
  onRename,
  onDelete,
  onReplace,
  isReordering,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  contentContainerStyle,
}: SegmentListProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  const handleReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      if (isReordering) return;
      if (from === to) return;
      if (
        from < 0 ||
        to < 0 ||
        from >= segments.length ||
        to >= segments.length
      ) {
        return;
      }
      const orderedIds = reorderItems(segments, from, to).map((s) => s.id);
      onReorder(orderedIds);
    },
    [isReordering, segments, onReorder],
  );

  const renderItem = useCallback(
    ({ item }: { item: AdventureSegmentResponse }) => (
      <SegmentRow
        segment={item}
        locale={locale}
        disabled={Boolean(isReordering)}
        onRename={onRename}
        onDelete={onDelete}
        onReplace={onReplace}
      />
    ),
    [locale, isReordering, onRename, onDelete, onReplace],
  );

  return (
    <ReorderableList
      data={segments}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      onReorder={handleReorder}
      ListHeaderComponent={ListHeaderComponent ?? undefined}
      ListFooterComponent={ListFooterComponent ?? undefined}
      ListEmptyComponent={ListEmptyComponent ?? undefined}
      contentContainerStyle={contentContainerStyle}
      style={{ flex: 1 }}
    />
  );
}

interface SegmentRowProps {
  segment: AdventureSegmentResponse;
  locale: string;
  disabled: boolean;
  onRename: (segment: AdventureSegmentResponse) => void;
  onDelete: (segment: AdventureSegmentResponse) => void;
  onReplace: (segment: AdventureSegmentResponse) => void;
}

function SegmentRow({
  segment,
  locale,
  disabled,
  onRename,
  onDelete,
  onReplace,
}: SegmentRowProps) {
  const { t } = useTranslation();
  // Démarre le drag (appui long sur la poignée). Le hook ne fonctionne qu'à
  // l'intérieur d'un item rendu par `ReorderableList` (contexte requis).
  const drag = useReorderableDrag();
  const isDone = segment.parseStatus === 'done';

  return (
    <Card
      className="mb-3"
      accessibilityRole="summary"
      accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
    >
      <View className="flex-row items-center gap-2">
        {/* Poignée de drag explicite (appui long → réordonne). */}
        <Pressable
          onLongPress={disabled ? undefined : drag}
          delayLongPress={150}
          accessibilityRole="button"
          accessibilityLabel={t('adventures.segments.reorderA11y')}
          accessibilityState={{ disabled }}
          disabled={disabled}
          className="p-1 disabled:opacity-50"
        >
          <GripVerticalIcon size={20} className="text-text-muted" />
        </Pressable>
        <Text
          className="flex-1 text-base font-montserrat-semibold text-card-foreground"
          numberOfLines={1}
        >
          {segment.name}
        </Text>
        <SegmentStatusBadge status={segment.parseStatus} />
      </View>

      <View className="mt-2">
        {isDone ? (
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Text className="text-sm font-montserrat-semibold text-text-primary">
              {t('adventures.segments.distanceKm', {
                value: formatKm(segment.distanceKm, locale),
              })}
            </Text>
            {segment.elevationGainM != null ||
            segment.elevationLossM != null ? (
              <Text className="text-sm font-montserrat text-text-muted">
                {formatElevationDelta(
                  segment.elevationGainM,
                  segment.elevationLossM,
                  t,
                )}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text className="text-sm font-montserrat text-text-muted">
            {t('adventures.segments.parsing')}
          </Text>
        )}
      </View>

      <View className="mt-3 flex-row gap-4">
        <SegmentAction
          label={t('adventures.segments.rename')}
          disabled={disabled}
          onPress={() => onRename(segment)}
        >
          <PencilIcon size={16} className="text-foreground" />
        </SegmentAction>
        <SegmentAction
          label={t('adventures.segments.replace')}
          disabled={disabled}
          onPress={() => onReplace(segment)}
        >
          <RefreshCwIcon size={16} className="text-foreground" />
        </SegmentAction>
        <SegmentAction
          label={t('adventures.segments.delete')}
          disabled={disabled}
          destructive
          onPress={() => onDelete(segment)}
        >
          <Trash2Icon size={16} className="text-destructive" />
        </SegmentAction>
      </View>
    </Card>
  );
}

interface SegmentActionProps {
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}

function SegmentAction({
  label,
  disabled,
  destructive,
  onPress,
  children,
}: SegmentActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center gap-1.5 disabled:opacity-50"
    >
      {children}
      <Text
        className={
          destructive
            ? 'text-sm font-montserrat-medium text-destructive'
            : 'text-sm font-montserrat-medium text-foreground'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
