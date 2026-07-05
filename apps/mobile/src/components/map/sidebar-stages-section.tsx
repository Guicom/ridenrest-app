import {
  STAGE_COLORS,
  type AdventureStageResponse,
} from '@ridenrest/shared';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StageCard } from '@/components/map/stage-card';
import {
  StageDialog,
  type StageFormValues,
} from '@/components/map/stage-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MapIcon,
  PlusIcon,
  XIcon,
} from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';

// Carte « Étapes » (mode planning) — port iso de `sidebar-stages-section.tsx` web.
// Toggle « Afficher sur la carte » (store `stagesVisible`), bouton placement (tap trace),
// liste + édition/suppression. La création part d'un tap sur la trace (`pendingEndKm`).

export interface SidebarStagesSectionProps {
  stages: AdventureStageResponse[];
  defaultSpeedKmh: number;
  stagesVisible: boolean;
  onStagesVisibilityChange: (visible: boolean) => void;
  isClickModeActive: boolean;
  onEnterClickMode: () => void;
  onExitClickMode: () => void;
  /** km (cumulé) issu d'un tap sur la trace → ouvre le dialog de création. */
  pendingEndKm: number | null;
  onPendingHandled: () => void;
  onCreate: (input: {
    name: string;
    endKm: number;
    color: string;
    departureTime: string | null;
    speedKmh: number | null;
    pauseHours: number | null;
  }) => Promise<void>;
  onUpdate: (
    stageId: string,
    input: {
      name?: string;
      color?: string;
      departureTime?: string | null;
      speedKmh?: number | null;
      pauseHours?: number | null;
    },
  ) => Promise<void>;
  onDelete: (stageId: string) => Promise<void>;
  isOnline: boolean;
}

export function SidebarStagesSection({
  stages,
  defaultSpeedKmh,
  stagesVisible,
  onStagesVisibilityChange,
  isClickModeActive,
  onEnterClickMode,
  onExitClickMode,
  pendingEndKm,
  onPendingHandled,
  onCreate,
  onUpdate,
  onDelete,
  isOnline,
}: SidebarStagesSectionProps) {
  const { t } = useTranslation();
  // Replié par défaut (seul « Recherche » est ouvert au départ).
  const [expanded, setExpanded] = useState(false);
  const [editStage, setEditStage] = useState<AdventureStageResponse | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<AdventureStageResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const autoColor = STAGE_COLORS[stages.length % STAGE_COLORS.length];
  const defaultName = t('map.stages.defaultName', { n: stages.length + 1 });

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
            {t('map.stages.title')}
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
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-montserrat text-text-muted">
              {t('map.showOnMap')}
            </Text>
            <Switch
              checked={stagesVisible}
              onCheckedChange={onStagesVisibilityChange}
              accessibilityLabel={t('map.showOnMap')}
              testID="stages-visibility-toggle"
            />
          </View>

          {isClickModeActive ? (
            <Button
              variant="outline"
              size="lg"
              onPress={onExitClickMode}
              accessibilityLabel={t('map.stages.cancelPlacement')}
            >
              <XIcon size={14} className="text-text-primary" />
              <Text className="ml-1 text-sm font-montserrat-medium text-text-primary">
                {t('map.stages.cancelPlacement')}
              </Text>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="lg"
              disabled={!isOnline}
              onPress={onEnterClickMode}
            >
              <PlusIcon size={14} className="text-text-primary" />
              <Text className="ml-1 text-sm font-montserrat-medium text-text-primary">
                {t('map.stages.addStage')}
              </Text>
            </Button>
          )}

          {isClickModeActive ? (
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.placementHint')}
            </Text>
          ) : null}

          {stages.length > 0 ? (
            <View className="gap-2">
              {stages.map((stage) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  onEdit={setEditStage}
                  onDelete={setDeleteTarget}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Dialog création (après tap trace) */}
      {pendingEndKm != null ? (
        <StageDialog
          key={`create-${pendingEndKm}`}
          open
          mode="create"
          defaultSpeedKmh={defaultSpeedKmh}
          isPending={busy}
          initial={{
            name: defaultName,
            color: autoColor,
            departureTime: null,
            speedKmh: null,
            pauseHours: null,
          }}
          onClose={() => {
            onPendingHandled();
            onExitClickMode();
          }}
          onSubmit={async (values: StageFormValues) => {
            setBusy(true);
            try {
              await onCreate({ ...values, endKm: pendingEndKm });
              onPendingHandled();
              onExitClickMode();
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {/* Dialog édition */}
      {editStage ? (
        <StageDialog
          key={`edit-${editStage.id}`}
          open
          mode="edit"
          defaultSpeedKmh={defaultSpeedKmh}
          isPending={busy}
          initial={{
            name: editStage.name,
            color: editStage.color,
            departureTime: editStage.departureTime,
            speedKmh: editStage.speedKmh,
            pauseHours: editStage.pauseHours,
          }}
          onClose={() => setEditStage(null)}
          onSubmit={async (values: StageFormValues) => {
            setBusy(true);
            try {
              await onUpdate(editStage.id, values);
              setEditStage(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {/* Confirmation suppression */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('map.stages.deleteTitle')}</DialogTitle>
        <DialogBody>
          <Text className="text-sm font-montserrat text-text-muted">
            {t('map.stages.deleteBody', { name: deleteTarget?.name ?? '' })}
          </Text>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            size="lg"
            label={t('common.cancel')}
            onPress={() => setDeleteTarget(null)}
          />
          <Button
            variant="destructive"
            size="lg"
            label={t('common.delete')}
            disabled={busy}
            onPress={async () => {
              if (!deleteTarget) return;
              setBusy(true);
              try {
                await onDelete(deleteTarget.id);
                setDeleteTarget(null);
              } finally {
                setBusy(false);
              }
            }}
          />
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
