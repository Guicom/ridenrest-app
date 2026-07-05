import { zodResolver } from '@hookform/resolvers/zod';
import {
  createAdventureSchema,
  type CreateAdventureInput,
} from '@ridenrest/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import { useCreateAdventure } from '@/hooks/use-adventures';
import { useTranslation } from '@/lib/i18n';

// Écran création d'aventure (MOB-3.1 / AC2, AC7). RHF + zodResolver sur le schéma
// PARTAGÉ `createAdventureSchema` (name 1–100) — jamais dupliqué. Au succès, on va
// au détail de l'aventure fraîchement créée (parité web). Les erreurs réseau/serveur
// s'affichent inline via <ErrorBanner> (jamais Alert.alert).
export default function NewAdventureScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateAdventure();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateAdventureInput>({
    resolver: zodResolver(createAdventureSchema),
    defaultValues: { name: '' },
  });

  // Les issues Zod du schéma partagé ne portent pas de clé i18n → on mappe le
  // code d'erreur RHF (`too_big` = > 100) vers nos messages traduits.
  const nameError = errors.name
    ? errors.name.type === 'too_big'
      ? t('adventures.errors.nameTooLong')
      : t('adventures.errors.nameRequired')
    : undefined;

  const onSubmit = (values: CreateAdventureInput) => {
    // Anti double-submit : le bouton se désactive via `loading`, mais la touche
    // clavier « done » (`onSubmitEditing`) n'est pas gardée → garde explicite ici.
    if (createMutation.isPending) return;
    setSubmitError(null);
    createMutation.mutate(values.name.trim(), {
      onSuccess: (created) => {
        router.replace(`/(app)/adventures/${created.id}`);
      },
      onError: () => {
        setSubmitError(t('adventures.errors.createFailed'));
      },
    });
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background-page"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow gap-6 p-6"
        contentContainerStyle={{ paddingTop: insets.top + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-montserrat-bold text-text-primary">
            {t('adventures.new.title')}
          </Text>
          <Button
            variant="link"
            size="sm"
            className="px-0"
            label={t('common.cancel')}
            onPress={() => router.back()}
          />
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('adventures.new.nameLabel')}
                placeholder={t('adventures.new.namePlaceholder')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={nameError}
                maxLength={100}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
              />
            )}
          />

          {submitError ? <ErrorBanner message={submitError} /> : null}

          <Button
            size="lg"
            className="w-full"
            loading={createMutation.isPending}
            label={
              createMutation.isPending
                ? t('adventures.new.submitting')
                : t('adventures.new.submit')
            }
            onPress={handleSubmit(onSubmit)}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
