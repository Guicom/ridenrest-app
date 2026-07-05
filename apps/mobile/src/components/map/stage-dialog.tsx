import { STAGE_COLORS } from '@ridenrest/shared';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';

// Formulaire d'étape (création / édition) — port iso des dialogs web. Champs : nom,
// couleur (auto en création / palette en édition), date de départ (texte ISO, pas de
// picker natif → zéro nouveau module), vitesse (5–50), pause (0–12 h). Le parent doit
// remonter le composant via `key` pour réinitialiser l'état entre deux étapes éditées.

export interface StageFormValues {
  name: string;
  color: string;
  departureTime: string | null;
  speedKmh: number | null;
  pauseHours: number | null;
}

export interface StageDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Valeurs initiales (édition) ou couleur auto + nom suggéré (création). */
  initial: StageFormValues;
  defaultSpeedKmh: number;
  isPending?: boolean;
  onSubmit: (values: StageFormValues) => void;
  onClose: () => void;
}

/** « 2026-06-15T07:30 » (datetime-local) → champ texte. Parse souple. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function StageDialog({
  open,
  mode,
  initial,
  defaultSpeedKmh,
  isPending = false,
  onSubmit,
  onClose,
}: StageDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [departure, setDeparture] = useState(() =>
    toLocalInput(initial.departureTime),
  );
  const [speed, setSpeed] = useState(
    initial.speedKmh != null ? String(initial.speedKmh) : '',
  );
  const [pause, setPause] = useState(
    initial.pauseHours != null ? String(initial.pauseHours) : '',
  );

  const submit = () => {
    const parsedSpeed = parseFloat(speed);
    const parsedPause = parseFloat(pause);
    onSubmit({
      name: name.trim() || initial.name,
      color,
      departureTime: parseLocalInput(departure),
      speedKmh:
        !isNaN(parsedSpeed) && parsedSpeed !== defaultSpeedKmh
          ? parsedSpeed
          : null,
      pauseHours: !isNaN(parsedPause) && parsedPause > 0 ? parsedPause : null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        {mode === 'create' ? t('map.stages.createTitle') : t('map.stages.editTitle')}
      </DialogTitle>
      <DialogBody>
        <View className="gap-1.5">
          <Text className="text-xs font-montserrat text-text-muted">
            {t('map.stages.fieldName')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={initial.name}
            accessibilityLabel={t('map.stages.fieldName')}
            testID="stage-name-input"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-montserrat text-text-primary"
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-montserrat text-text-muted">
            {t('map.stages.fieldColor')}
          </Text>
          {mode === 'create' ? (
            <View className="flex-row items-center gap-2">
              <View
                className="h-6 w-6 rounded-full border-2 border-white"
                style={{ backgroundColor: color }}
              />
              <Text className="text-xs font-montserrat text-text-muted">
                {t('map.stages.colorAuto')}
              </Text>
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {STAGE_COLORS.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={c}
                  accessibilityState={{ selected: color === c }}
                  onPress={() => setColor(c)}
                  testID={`stage-color-${c}`}
                  style={{ backgroundColor: c }}
                  className={
                    color === c
                      ? 'h-7 w-7 rounded-full border-2 border-text-primary'
                      : 'h-7 w-7 rounded-full border-2 border-transparent'
                  }
                />
              ))}
            </View>
          )}
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-montserrat text-text-muted">
            {t('map.stages.fieldDeparture')}
          </Text>
          <TextInput
            value={departure}
            onChangeText={setDeparture}
            placeholder={t('common.dateTimePlaceholder')}
            autoCapitalize="none"
            accessibilityLabel={t('map.stages.fieldDeparture')}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-montserrat text-text-primary"
          />
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 gap-1.5">
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.fieldSpeed')}
            </Text>
            <TextInput
              value={speed}
              onChangeText={setSpeed}
              inputMode="numeric"
              keyboardType="number-pad"
              placeholder={String(defaultSpeedKmh)}
              accessibilityLabel={t('map.stages.fieldSpeed')}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-montserrat text-text-primary"
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.fieldPause')}
            </Text>
            <TextInput
              value={pause}
              onChangeText={setPause}
              inputMode="numeric"
              keyboardType="number-pad"
              placeholder="0"
              accessibilityLabel={t('map.stages.fieldPause')}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-montserrat text-text-primary"
            />
          </View>
        </View>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          size="lg"
          label={t('common.cancel')}
          onPress={onClose}
        />
        <Button
          size="lg"
          label={t('common.save')}
          disabled={isPending}
          onPress={submit}
          testID="stage-save-btn"
        />
      </DialogFooter>
    </Dialog>
  );
}
