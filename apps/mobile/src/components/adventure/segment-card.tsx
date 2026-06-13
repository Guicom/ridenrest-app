import { Platform, Text, View } from 'react-native';
import type { AdventureSegmentResponse } from '@ridenrest/shared';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';

import { SegmentStatusBadge } from './segment-status-badge';

// Carte d'un segment GPX — 4 états (MOB-3.2 / AC2-3, parité web 3.2 Task 3) :
//   pending/processing → Skeleton (distance/dénivelé) + badge + libellé d'état
//   done               → nom, distance, D+/D-, badge « Analysé »
//   error              → ErrorBanner + bouton « Réessayer »
//
// A11y : annonce des transitions via `accessibilityLiveRegion="polite"` (Android)
// + `accessibilityRole="summary"` (le statut change pendant le polling).
// Défensif : `distanceKm`/`elevationGainM`/`elevationLossM` peuvent être `0`/`null`
// même en `done` → libellés robustes (N/A pour le dénivelé absent).

export interface SegmentCardProps {
  segment: AdventureSegmentResponse;
  /** Relance l'upload (état `error` uniquement). */
  onRetry?: (segment: AdventureSegmentResponse) => void;
}

function formatElevation(
  value: number | null,
  t: (k: string, opts?: Record<string, unknown>) => string,
  key: 'adventures.segments.elevationGain' | 'adventures.segments.elevationLoss',
): string {
  if (value == null) return t('adventures.segments.elevationNA');
  return t(key, { value: Math.round(value) });
}

export function SegmentCard({ segment, onRetry }: SegmentCardProps) {
  const { t } = useTranslation();
  const isParsing =
    segment.parseStatus === 'pending' || segment.parseStatus === 'processing';
  const isError = segment.parseStatus === 'error';

  return (
    <Card
      accessibilityRole="summary"
      accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text
          className="flex-1 text-base font-montserrat-semibold text-card-foreground"
          numberOfLines={1}
        >
          {segment.name}
        </Text>
        <SegmentStatusBadge status={segment.parseStatus} />
      </View>

      {isParsing ? (
        <View className="mt-3 gap-2">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-4 w-32 rounded-md" />
        </View>
      ) : isError ? (
        <View className="mt-3 gap-2">
          <ErrorBanner message={t('adventures.segments.parseFailed')} />
          {onRetry ? (
            <Button
              variant="outline"
              size="sm"
              label={t('adventures.segments.retry')}
              onPress={() => onRetry(segment)}
            />
          ) : null}
        </View>
      ) : (
        <View className="mt-3 flex-row items-center gap-3">
          <Text className="text-sm font-montserrat-semibold text-text-primary">
            {t('adventures.segments.distanceKm', {
              value: (segment.distanceKm ?? 0).toFixed(1),
            })}
          </Text>
          <Text className="text-sm font-montserrat text-text-muted">
            {formatElevation(
              segment.elevationGainM,
              t,
              'adventures.segments.elevationGain',
            )}
            {' · '}
            {formatElevation(
              segment.elevationLossM,
              t,
              'adventures.segments.elevationLoss',
            )}
          </Text>
        </View>
      )}
    </Card>
  );
}
