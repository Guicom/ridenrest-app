import { useCallback } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import {
  DropProvider,
  SortableItem,
  useSortableList,
} from 'react-native-reanimated-dnd';
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

// Liste DRAGGABLE de segments + distances (MOB-3.3 / T4, AC1 & AC4).
//
// - Réordre via `react-native-reanimated-dnd` (Reanimated 4 + New Arch). À la fin du
//   drag, `SortableItem.onDrop` expose `allPositions` (map id→index) → on en extrait
//   `orderedIds` (tri par position) et on appelle `onReorder` (→ mutation optimiste).
// - Distances issues du SERVEUR uniquement (`cumulativeStartKm`/`distanceKm` du
//   segment, `totalDistanceKm` de l'aventure) — JAMAIS recalculées ici. Le seul code
//   « distance » est le formatage `formatKm` (T6). Segment non `done` → libellé
//   « Analyse en cours… » plutôt qu'une fausse distance 0 km.
// - Le drag reste actif quel que soit `parseStatus` (réordre indépendant du parse).
// - Toutes les chaînes via `t()` ; actions désactivées pendant une mutation
//   (`isReordering`) pour éviter le double-déclenchement (AC5).

// Hauteur fixe d'un item : requise par la lib (calcul des positions de drag). Doit
// rester cohérente avec la hauteur réelle rendue de la carte (nom + ligne distances
// + boutons d'action).
const ITEM_HEIGHT = 132;

export interface SegmentListProps {
  adventureId: string;
  segments: AdventureSegmentResponse[];
  totalDistanceKm: number;
  onReorder: (orderedIds: string[]) => void;
  onRename: (segment: AdventureSegmentResponse) => void;
  onDelete: (segment: AdventureSegmentResponse) => void;
  onReplace: (segment: AdventureSegmentResponse) => void;
  /** Mutation reorder en vol → désactive les actions (anti double-submit, AC5). */
  isReordering?: boolean;
}

/** Reconstruit `orderedIds` depuis la map `{ [id]: position }` de la lib DnD. */
function positionsToOrderedIds(positions: Record<string, number>): string[] {
  return Object.entries(positions)
    .sort(([, a], [, b]) => a - b)
    .map(([id]) => id);
}

export function SegmentList({
  segments,
  totalDistanceKm,
  onReorder,
  onRename,
  onDelete,
  onReplace,
  isReordering,
}: SegmentListProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const handleDrop = useCallback(
    (positions: Record<string, number>) => {
      const orderedIds = positionsToOrderedIds(positions);
      // No-op si l'ordre n'a pas changé (drop sans déplacement réel).
      const currentIds = segments.map((s) => s.id);
      const changed =
        orderedIds.length === currentIds.length &&
        orderedIds.some((id, i) => id !== currentIds[i]);
      if (changed) onReorder(orderedIds);
    },
    [segments, onReorder],
  );

  // La liste triable est rendue dans un conteneur NON-scrollable (une `View` de
  // hauteur `contentHeight`), PAS via le composant `<Sortable>` qui embarque sa
  // propre `FlatList`/`ScrollView`. L'écran détail (`[id].tsx`) est déjà un
  // `<ScrollView>` vertical : y imbriquer une VirtualizedList déclenche
  // l'avertissement RN « VirtualizedLists should never be nested… » et écrase la
  // hauteur (le `flex:1` interne de `<Sortable>` colle à 0 dans un ScrollView). On
  // consomme donc les hooks `useSortableList` + `<DropProvider>` et on laisse le
  // ScrollView de page gérer le défilement (liste courte → auto-scroll non requis).
  const { dropProviderRef, getItemProps, contentHeight } = useSortableList({
    data: segments,
    itemHeight: ITEM_HEIGHT,
    itemKeyExtractor: (s) => s.id,
  });

  return (
    <View className="gap-3">
      <Text
        className="text-sm font-montserrat-semibold text-text-primary"
        accessibilityRole="header"
      >
        {t('adventures.segments.totalDistance', {
          km: formatKm(totalDistanceKm, locale),
        })}
      </Text>

      <DropProvider ref={dropProviderRef}>
        <View style={{ height: contentHeight }}>
          {segments.map((segment, index) => (
            <SortableItem
              key={segment.id}
              {...getItemProps(segment, index)}
              data={segment}
              onDrop={(_id, _position, allPositions) => {
                if (allPositions) handleDrop(allPositions);
              }}
            >
              <SegmentRow
                segment={segment}
                locale={locale}
                disabled={Boolean(isReordering)}
                onRename={onRename}
                onDelete={onDelete}
                onReplace={onReplace}
              />
            </SortableItem>
          ))}
        </View>
      </DropProvider>
    </View>
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
  const isDone = segment.parseStatus === 'done';

  return (
    <Card
      accessibilityRole="summary"
      accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
    >
      <View className="flex-row items-center gap-2">
        {/* Drag handle explicite (a11y). `SortableItem.Handle` capte le geste. */}
        <SortableItem.Handle>
          <View
            accessibilityRole="button"
            accessibilityLabel={t('adventures.segments.reorderA11y')}
            className="p-1"
          >
            <GripVerticalIcon size={20} className="text-text-muted" />
          </View>
        </SortableItem.Handle>
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
          <View className="flex-row items-center gap-3">
            <Text className="text-sm font-montserrat text-text-muted">
              {t('adventures.segments.cumulative', {
                km: formatKm(segment.cumulativeStartKm, locale),
              })}
            </Text>
            <Text className="text-sm font-montserrat-semibold text-text-primary">
              {t('adventures.segments.length', {
                km: formatKm(segment.distanceKm, locale),
              })}
            </Text>
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
