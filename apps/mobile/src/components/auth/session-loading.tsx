import { ActivityIndicator, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';

// Écran de chargement affiché tant que la session n'est pas résolue (MOB-2.1 / AC3).
// Évite tout flash login→app au cold start : les guards `(auth)`/`(app)` rendent
// ce loader pendant `isPending` plutôt qu'une redirection prématurée.
export function SessionLoading() {
  const { t } = useTranslation();
  return (
    <View
      className="flex-1 items-center justify-center gap-3 bg-background-page"
      accessibilityLabel="session-loading"
    >
      <ActivityIndicator size="large" />
      <Text className="text-sm font-montserrat text-text-muted">
        {t('auth.loadingSession')}
      </Text>
    </View>
  );
}
