import { Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useProfile, useUpdateOverpass } from '@/hooks/use-profile';
import { useTranslation } from '@/lib/i18n';

// Section « Recherche étendue (Overpass) » des Paramètres — port iso du `OverpassToggle`
// web. Opt-in : résultats POI plus complets (campings/refuges) mais recherches plus
// lentes. Lit `profile.overpassEnabled` (source de vérité serveur) + PATCH au toggle.
// L'état affiché suit `profile` (pas d'état local) pour rester cohérent après refetch.

export function OverpassToggleSection() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const { mutate, isPending } = useUpdateOverpass();
  const enabled = profile?.overpassEnabled ?? false;

  return (
    <View className="gap-3">
      <Text className="px-1 text-xs font-montserrat-semibold uppercase text-text-muted">
        {t('settings.overpass.section')}
      </Text>
      <Card>
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm font-montserrat-semibold text-text-primary">
              {t('settings.overpass.title')}
            </Text>
            <Text className="mt-0.5 text-sm font-montserrat text-text-muted">
              {t('settings.overpass.description')}
            </Text>
          </View>
          <Switch
            checked={enabled}
            disabled={isPending || profile === undefined}
            onCheckedChange={(next) => mutate(next)}
            accessibilityLabel={t('settings.overpass.title')}
            testID="overpass-toggle"
          />
        </View>
      </Card>
    </View>
  );
}
