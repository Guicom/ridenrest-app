import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';

// Route cible des deep links `ridenrest://oauth-callback` (MOB-1.4 / AC4).
// PLACEHOLDER : prouve que le scheme `ridenrest://` ouvre l'app et est routé
// par Expo Router. Le flow OAuth réel (échange de code, session) arrive en
// MOB-2.3 (Google) / MOB-2.4 (Strava) — ici on affiche seulement les params
// reçus pour vérifier le câblage du deep link.
export default function OAuthCallbackScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background-page p-6">
      <Text className="text-2xl font-montserrat-bold text-text-primary">
        {t('oauthCallback.title')}
      </Text>
      <Text className="text-sm font-montserrat text-text-muted">
        {t('oauthCallback.subtitle')}
      </Text>
      <Text
        className="text-xs font-montserrat text-text-secondary"
        accessibilityLabel="oauth-callback-params"
      >
        {JSON.stringify(params)}
      </Text>
    </View>
  );
}
