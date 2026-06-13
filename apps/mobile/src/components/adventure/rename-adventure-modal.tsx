import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTranslation } from '@/lib/i18n';

// Modal de renommage d'aventure (MOB-3.1 / AC3). Partagé par l'écran liste et
// l'écran détail. Validation client alignée `createAdventureSchema` (non vide après
// trim, ≤ 100). `Alert.prompt` n'existe pas sous Android → <Modal> RN contrôlé.
//
// Le composant est purement présentationnel : il ne connaît ni la mutation ni le
// cache. L'écran fournit `isPending` (loading du bouton) et `onSubmit(id, name)` ;
// la fermeture au succès est pilotée par l'écran (qui appelle `onClose`).

const NAME_MIN = 1;
const NAME_MAX = 100;

export type RenameTarget = { id: string; currentName: string };

export interface RenameAdventureModalProps {
  /** Cible à renommer, ou `null` si le modal est fermé. */
  target: RenameTarget | null;
  /** Mutation en cours (bouton « Renommer » en loading + anti double-submit). */
  isPending: boolean;
  onClose: () => void;
  onSubmit: (id: string, name: string) => void;
}

export function RenameAdventureModal({
  target,
  isPending,
  onClose,
  onSubmit,
}: RenameAdventureModalProps) {
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
        {/* `onPress` vide : un tap dans la carte ne ferme pas le modal. */}
        <Pressable
          className="w-full gap-4 rounded-xl border border-border bg-card p-5"
          onPress={() => {}}
        >
          {/* `key={target.id}` : le formulaire se remonte à chaque changement de
              cible → `useState(initialName)` seede le champ de façon fiable
              cross-plateforme (Modal.onShow est peu fiable sous Android). */}
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
    if (error) return;
    onSubmit(trimmed);
  };

  return (
    <>
      <Text className="text-lg font-montserrat-semibold text-text-primary">
        {t('adventures.rename.title')}
      </Text>
      <TextField
        label={t('adventures.rename.nameLabel')}
        value={value}
        onChangeText={setValue}
        error={touched ? error : undefined}
        maxLength={NAME_MAX}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />
      <View className="flex-row justify-end gap-2">
        <Button variant="ghost" label={t('common.cancel')} onPress={onCancel} />
        <Button
          loading={isPending}
          label={
            isPending
              ? t('adventures.rename.submitting')
              : t('adventures.rename.submit')
          }
          onPress={handleSubmit}
        />
      </View>
    </>
  );
}
