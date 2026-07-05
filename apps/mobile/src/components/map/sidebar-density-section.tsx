import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { DensityCategoryDialog } from '@/components/map/density-category-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronDownIcon, ChevronUpIcon, MapIcon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { useDensity } from '@/hooks/use-density';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useMapStore } from '@/lib/stores/map.store';
import { useTranslation } from '@/lib/i18n';

// Carte « Densité » (mode planning) — port iso de `sidebar-density-section.tsx` web.
// États : idle/error/stale (CTA + dialog catégories) → pending/processing (spinner +
// barre 0–100) → success (toggle « Afficher sur la carte » + légende 3 niveaux).

export const DENSITY_COLORS = {
  high: '#16a34a',
  medium: '#d97706',
  critical: '#dc2626',
} as const;

function LegendItem({
  color,
  label,
  detail,
}: {
  color: string;
  label: string;
  detail: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Text className="text-xs font-montserrat-medium text-text-primary">
        {label}
      </Text>
      <Text className="text-xs font-montserrat text-text-muted">— {detail}</Text>
    </View>
  );
}

export interface SidebarDensitySectionProps {
  adventureId: string;
  allSegmentsParsed: boolean;
  /** Hors-ligne : le déclenchement d'une nouvelle analyse est désactivé (AC5). */
  isOnline: boolean;
}

export function SidebarDensitySection({
  adventureId,
  allSegmentsParsed,
  isOnline,
}: SidebarDensitySectionProps) {
  const { t } = useTranslation();
  // Replié par défaut (seul « Recherche » est ouvert au départ).
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const densityColorEnabled = useMapStore((s) => s.densityColorEnabled);
  const toggleDensityColor = useMapStore((s) => s.toggleDensityColor);
  // MOB-6.2 — permission push demandée APRÈS la 1re analyse (AC1). One-shot géré par le hook.
  const { requestAndRegister } = usePushNotifications();

  const {
    densityStatus,
    densityProgress,
    densityStale,
    isTriggering,
    isTriggerConflict,
    isTriggerError,
    trigger,
  } = useDensity(adventureId);

  const needsCalculation =
    densityStatus === 'idle' ||
    densityStatus === 'error' ||
    (densityStatus === 'success' && densityStale);
  const isAnalyzing =
    densityStatus === 'pending' || densityStatus === 'processing';
  const isDone = densityStatus === 'success' && !densityStale;

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center justify-between"
      >
        <View className="flex-row items-center gap-2">
          <MapIcon size={16} className="text-text-primary" />
          <Text className="text-sm font-montserrat-medium text-text-primary">
            {t('map.density.title')}
          </Text>
        </View>
        {expanded ? (
          <ChevronUpIcon size={16} className="text-text-muted" />
        ) : (
          <ChevronDownIcon size={16} className="text-text-muted" />
        )}
      </Pressable>

      {expanded ? (
        <View className="mt-3 gap-3">
          {needsCalculation ? (
            <>
              <Text className="text-xs font-montserrat text-text-muted">
                {densityStatus === 'error'
                  ? t('map.density.errorHint')
                  : densityStale
                    ? t('map.density.staleHint')
                    : t('map.density.idleHint')}
              </Text>
              <Button
                size="lg"
                disabled={!isOnline || !allSegmentsParsed || isTriggering}
                onPress={isOnline ? () => setDialogOpen(true) : undefined}
                label={
                  densityStatus === 'error'
                    ? t('common.retry')
                    : t('map.density.calculate')
                }
                testID="density-cta-btn"
              />
              {!isOnline ? (
                <Text className="text-xs font-montserrat text-text-muted">
                  {t('map.density.offline')}
                </Text>
              ) : null}
            </>
          ) : null}

          {/* 409 — analyse déjà en cours : message dédié non bloquant (AC1). */}
          {isTriggerConflict ? (
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.density.inProgress')}
            </Text>
          ) : null}
          {/* Échec du lancement (hors 409) : message non bloquant + relance via le CTA. */}
          {isTriggerError ? (
            <Text className="text-xs font-montserrat text-destructive">
              {t('map.density.triggerFailed')}
            </Text>
          ) : null}

          {isAnalyzing ? (
            <View className="flex-row items-center gap-3 py-1">
              <ActivityIndicator size="small" />
              <View className="flex-1">
                <Text className="text-sm font-montserrat text-text-muted">
                  {t('map.density.analyzing')}
                  {densityProgress > 0 ? ` ${densityProgress}%` : ''}
                </Text>
                {densityProgress > 0 ? (
                  <View className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <View
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${densityProgress}%` }}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {isDone ? (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-montserrat text-text-muted">
                  {t('map.showOnMap')}
                </Text>
                <Switch
                  checked={densityColorEnabled}
                  onCheckedChange={toggleDensityColor}
                  accessibilityLabel={t('map.density.title')}
                  testID="density-toggle"
                />
              </View>
              <View className="gap-1.5">
                <Text className="mb-1 text-xs font-montserrat-medium uppercase text-text-muted">
                  {t('map.density.legendTitle')}
                </Text>
                <LegendItem
                  color={DENSITY_COLORS.high}
                  label={t('map.density.high')}
                  detail={t('map.density.highDetail')}
                />
                <LegendItem
                  color={DENSITY_COLORS.medium}
                  label={t('map.density.medium')}
                  detail={t('map.density.mediumDetail')}
                />
                <LegendItem
                  color={DENSITY_COLORS.critical}
                  label={t('map.density.critical')}
                  detail={t('map.density.criticalDetail')}
                />
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <DensityCategoryDialog
        open={dialogOpen}
        isLoading={isTriggering}
        onClose={() => setDialogOpen(false)}
        onConfirm={async (categories) => {
          await trigger(categories);
          setDialogOpen(false);
          // MOB-6.2 / AC1 — « après la première analyse de densité » : on demande la
          // permission push (une seule fois, garde interne au hook). Best-effort, non
          // bloquant : un refus n'impacte pas le flux (fallback in-app polling, AC3).
          void requestAndRegister();
        }}
      />
    </Card>
  );
}
