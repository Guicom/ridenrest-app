import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StravaConnectionCard } from '@/components/shared/strava-connection-card';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

// Écran Paramètres (MOB-2.4 / AC1) — route protégée par le guard `(app)/_layout`
// (utilisateur connecté garanti, prérequis de l'account-linking Strava). Pour cette
// story, il n'héberge que l'intégration Strava ; les autres sections (apparence,
// confidentialité, session/suppression de compte) arrivent en MOB-2.5+.
//
// La carte Strava possède son propre `<Card>` → on ne la re-wrappe pas ici.
export default function SettingsScreen() {
  const { t } = useTranslation();
  // En-tête custom (`headerShown: false`) → on décale le contenu sous la status bar /
  // Dynamic Island via l'inset haut (le bas/les côtés sont couverts par `p-6`).
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background-page"
      contentContainerClassName="gap-6 p-6"
      contentContainerStyle={{ paddingTop: insets.top + 24 }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-montserrat-bold text-text-primary">
          {t('settings.title')}
        </Text>
        <Button
          variant="link"
          size="sm"
          className="px-0"
          label={t('settings.back')}
          onPress={() => router.back()}
        />
      </View>

      <View className="gap-3">
        <Text className="px-1 text-xs font-montserrat-semibold uppercase text-text-muted">
          {t('settings.integrationsSection')}
        </Text>
        <StravaConnectionCard />
      </View>
    </ScrollView>
  );
}
