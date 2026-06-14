import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { CheckIcon, PencilIcon, XIcon } from '@/components/ui/icon';
import { updateAdventureAvgSpeedKmh } from '@/lib/api/adventures';
import { useTranslation } from '@/lib/i18n';

// Carte « Vitesse moyenne » (mode planning) — port iso de l'inline web (map-view.tsx).
// Affiche `avgSpeedKmh` ; édition inline → PATCH /adventures/:id puis invalidation des
// queries dépendantes (aventure + étapes : le serveur recalcule les ETA en cascade).
// Bornes 5–50 km/h (parité serveur).

const MIN_SPEED = 5;
const MAX_SPEED = 50;

export interface AvgSpeedCardProps {
  adventureId: string;
  avgSpeedKmh: number;
  isOnline: boolean;
}

export function AvgSpeedCard({
  adventureId,
  avgSpeedKmh,
  isOnline,
}: AvgSpeedCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(() => String(avgSpeedKmh));

  const mutation = useMutation({
    mutationFn: (speed: number) =>
      updateAdventureAvgSpeedKmh(adventureId, speed),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['adventures', adventureId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['adventures', adventureId, 'stages'],
      });
      void queryClient.invalidateQueries({ queryKey: ['weather'] });
      setEditing(false);
    },
  });

  const startEdit = () => {
    setInput(String(avgSpeedKmh));
    setEditing(true);
  };

  const save = () => {
    const parsed = parseInt(input, 10);
    if (isNaN(parsed)) {
      setEditing(false);
      return;
    }
    const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, parsed));
    if (clamped === avgSpeedKmh) {
      setEditing(false);
      return;
    }
    mutation.mutate(clamped);
  };

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-montserrat-medium text-text-primary">
          {t('map.avgSpeed.title')}
        </Text>
        {editing ? (
          <View className="flex-row items-center gap-2">
            <TextInput
              value={input}
              onChangeText={setInput}
              inputMode="numeric"
              keyboardType="number-pad"
              autoFocus
              accessibilityLabel={t('map.avgSpeed.title')}
              testID="avg-speed-input"
              className="w-12 border-b border-border text-right text-sm font-montserrat-semibold text-text-primary"
            />
            <Text className="text-sm font-montserrat text-text-muted">
              {t('map.avgSpeed.unit')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
              onPress={save}
              disabled={mutation.isPending}
              className="h-8 w-8 items-center justify-center rounded-full bg-primary"
            >
              <CheckIcon size={16} color="#ffffff" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={() => setEditing(false)}
              className="h-8 w-8 items-center justify-center rounded-full border border-border"
            >
              <XIcon size={16} className="text-text-muted" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.avgSpeed.edit')}
            onPress={isOnline ? startEdit : undefined}
            disabled={!isOnline}
            className="flex-row items-center gap-2"
          >
            <Text className="text-sm font-montserrat-semibold text-text-primary">
              {avgSpeedKmh} {t('map.avgSpeed.unit')}
            </Text>
            <PencilIcon size={14} className="text-text-muted" />
          </Pressable>
        )}
      </View>
    </Card>
  );
}
