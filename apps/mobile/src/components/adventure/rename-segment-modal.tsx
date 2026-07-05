import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTranslation } from '@/lib/i18n';

// Modal de renommage de SEGMENT (MOB-3.3 / T5, AC3). Calqué sur
// `RenameAdventureModal` (MOB-3.1) : purement présentationnel (ne connaît ni la
// mutation ni le cache), validation client (non vide après trim, ≤ 100), remontage
// via `key={target.id}` pour seeder le champ de façon fiable cross-plateforme.

const NAME_MIN = 1;
const NAME_MAX = 100;

export type RenameSegmentTarget = { id: string; currentName: string };

export interface RenameSegmentModalProps {
  /** Cible à renommer, ou `null` si le modal est fermé. */
  target: RenameSegmentTarget | null;
  /** Mutation en cours (bouton loading + anti double-submit). */
  isPending: boolean;
  onClose: () => void;
  onSubmit: (id: string, name: string) => void;
}

export function RenameSegmentModal({
  target,
  isPending,
  onClose,
  onSubmit,
}: RenameSegmentModalProps) {
  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 p-6"
        onPress={onClose}
      >
        <Pressable
          className="w-full gap-4 rounded-xl border border-border bg-card p-5"
          onPress={() => {}}
        >
          {target ? (
            <RenameForm
              key={target.id}
              initialName={target.currentName}
              isPending={isPending}
              onCancel={onClose}
              onSubmit={(name) => onSubmit(target.id, name)}
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface RenameFormProps {
  initialName: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

function RenameForm({
  initialName,
  isPending,
  onCancel,
  onSubmit,
}: RenameFormProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialName);
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const error =
    trimmed.length < NAME_MIN
      ? t('adventures.errors.nameRequired')
      : trimmed.length > NAME_MAX
        ? t('adventures.errors.nameTooLong')
        : undefined;

  const handleSubmit = () => {
    setTouched(true);
    if (isPending || error) return;
    onSubmit(trimmed);
  };

  return (
    <>
      <Text className="text-lg font-montserrat-semibold text-text-primary">
        {t('adventures.segments.renameTitle')}
      </Text>
      <TextField
        label={t('adventures.segments.renameLabel')}
        value={value}
        onChangeText={setValue}
        error={touched ? error : undefined}
        maxLength={NAME_MAX}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />
      <View className="flex-row justify-end gap-2">
        <Button
          variant="ghost"
          label={t('common.cancel')}
          disabled={isPending}
          onPress={onCancel}
        />
        <Button
          loading={isPending}
          disabled={Boolean(error)}
          label={t('common.save')}
          onPress={handleSubmit}
        />
      </View>
    </>
  );
}
