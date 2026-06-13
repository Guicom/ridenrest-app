import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RenameAdventureModal,
  type RenameTarget,
} from '@/components/adventure/rename-adventure-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/error-banner';
import { PencilIcon, Trash2Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdventure,
  useDeleteAdventure,
  useRenameAdventure,
} from '@/hooks/use-adventures';
import { useTranslation } from '@/lib/i18n';

// Écran détail d'aventure — SQUELETTE (MOB-3.1 / AC1, AC3, AC4, AC7). Affiche le
// nom + actions (renommer/supprimer). Volontairement minimal : MOB-3.2 y greffera
// les segments/upload GPX et MOB-3.3 les dates/vitesse/profil → ne pas verrouiller
// la structure ni sur-construire. Un placeholder `comingSoon` l'indique.
export default function AdventureDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isPending, isError } = useAdventure(id);
  const renameMutation = useRenameAdventure();
  const deleteMutation = useDeleteAdventure();

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);

  const paddingTop = insets.top + 24;

  const confirmDelete = () => {
    if (!data) return;
    Alert.alert(
      t('adventures.delete.confirmTitle', { name: data.name }),
      t('adventures.delete.confirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('adventures.delete.confirm'),
          style: 'destructive',
          onPress: () =>
            deleteMutation.mutate(id, {
              // Au succès, on quitte le détail (l'item n'existe plus).
              onSuccess: () => router.replace('/(app)/adventures'),
            }),
        },
      ],
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background-page"
      contentContainerClassName="gap-6 p-6"
      contentContainerStyle={{ paddingTop }}
    >
      <View className="flex-row items-center justify-between">
        <Button
          variant="link"
          size="sm"
          className="px-0"
          label={t('settings.back')}
          onPress={() => router.back()}
        />
      </View>

      {isPending ? (
        <View className="gap-3">
          <Skeleton className="h-8 w-2/3 rounded-lg" />
          <Skeleton className="h-20 rounded-xl" />
        </View>
      ) : isError || !data ? (
        <ErrorBanner message={t('adventures.errors.loadFailed')} />
      ) : (
        <>
          <Text className="text-2xl font-montserrat-bold text-text-primary">
            {data.name}
          </Text>

          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              accessibilityLabel={t('adventures.card.renameA11y')}
              onPress={() =>
                setRenameTarget({ id: data.id, currentName: data.name })
              }
            >
              <View className="flex-row items-center gap-2">
                <PencilIcon size={18} className="text-foreground" />
                <Text className="text-sm font-montserrat-semibold text-foreground">
                  {t('common.rename')}
                </Text>
              </View>
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={deleteMutation.isPending}
              accessibilityLabel={t('adventures.card.deleteA11y')}
              onPress={confirmDelete}
            >
              <View className="flex-row items-center gap-2">
                <Trash2Icon size={18} className="text-white" />
                <Text className="text-sm font-montserrat-semibold text-white">
                  {t('common.delete')}
                </Text>
              </View>
            </Button>
          </View>

          {renameMutation.isError ? (
            <ErrorBanner message={t('adventures.errors.renameFailed')} />
          ) : null}
          {deleteMutation.isError ? (
            <ErrorBanner message={t('adventures.errors.deleteFailed')} />
          ) : null}

          {/* Placeholder explicite : segments/dates/carte arrivent en MOB-3.2/3.3. */}
          <Card>
            <Text className="text-sm font-montserrat text-text-muted">
              {t('adventures.detail.comingSoon')}
            </Text>
          </Card>
        </>
      )}

      <RenameAdventureModal
        target={renameTarget}
        isPending={renameMutation.isPending}
        onClose={() => setRenameTarget(null)}
        onSubmit={(targetId, name) =>
          renameMutation.mutate(
            { id: targetId, name },
            { onSuccess: () => setRenameTarget(null) },
          )
        }
      />
    </ScrollView>
  );
}
