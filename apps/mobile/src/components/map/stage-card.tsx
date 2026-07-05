import type { AdventureStageResponse } from '@ridenrest/shared';
import { Pressable, Text, View } from 'react-native';

import { PencilIcon, Trash2Icon } from '@/components/ui/icon';
import { formatKm } from '@/lib/format/distance';
import { formatEta, formatStageDeparture } from '@/lib/format/stage';
import { useTranslation } from '@/lib/i18n';

// Ligne d'étape (mode planning) — port iso de `stage-card.tsx` web. Pastille couleur +
// nom + édition/suppression ; distance · D+ · D− ; date de départ ; ETA (avec pause).

export interface StageCardProps {
  stage: AdventureStageResponse;
  onEdit: (stage: AdventureStageResponse) => void;
  onDelete: (stage: AdventureStageResponse) => void;
}

export function StageCard({ stage, onEdit, onDelete }: StageCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const departure = formatStageDeparture(stage.departureTime, locale);

  return (
    <View className="rounded-lg border border-border bg-card p-2.5">
      <View className="flex-row items-center gap-2">
        <View
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: stage.color }}
        />
        <Text
          numberOfLines={1}
          className="flex-1 text-sm font-montserrat-medium text-text-primary"
        >
          {stage.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.rename')}
          onPress={() => onEdit(stage)}
          className="h-8 w-8 items-center justify-center"
        >
          <PencilIcon size={14} className="text-text-muted" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
          onPress={() => onDelete(stage)}
          className="h-8 w-8 items-center justify-center"
        >
          <Trash2Icon size={14} className="text-text-muted" />
        </Pressable>
      </View>

      <View className="flex-row flex-wrap items-center gap-1.5 pl-5">
        <Text className="text-xs font-montserrat text-text-muted">
          {formatKm(stage.distanceKm, locale)} km
        </Text>
        <Text className="text-xs font-montserrat text-text-muted">·</Text>
        <Text className="text-xs font-montserrat text-text-muted">
          ↑ {stage.elevationGainM !== null ? `${stage.elevationGainM} m` : '—'}
        </Text>
        <Text className="text-xs font-montserrat text-text-muted">·</Text>
        <Text className="text-xs font-montserrat text-text-muted">
          ↓ {stage.elevationLossM !== null ? `${stage.elevationLossM} m` : '—'}
        </Text>
      </View>

      {departure ? (
        <Text className="pl-5 text-xs font-montserrat text-text-muted">
          {departure}
        </Text>
      ) : null}

      {stage.etaMinutes != null ? (
        <Text className="pl-5 text-xs font-montserrat text-text-muted">
          ETA {formatEta(stage.etaMinutes)}
          {stage.pauseHours != null && stage.pauseHours > 0
            ? ` ${t('map.stages.pauseSuffix', {
                pause: formatEta(stage.pauseHours * 60),
              })}`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}
