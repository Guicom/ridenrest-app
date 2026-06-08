import { Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';

// PLACEHOLDER (MOB-2.1 / frontière de story). Prouve le guard inverse `(auth)` et
// la cible de redirection des utilisateurs non connectés. Le **formulaire réel**
// (email/mot de passe, RHF, validation) arrive en **MOB-2.2** ; Google en MOB-2.3.
export default function LoginScreen() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background-page p-6">
      <Text className="text-2xl font-montserrat-bold text-text-primary">
        {t('auth.login.title')}
      </Text>
      <Text className="text-center text-sm font-montserrat text-text-muted">
        {t('auth.login.placeholder')}
      </Text>
    </View>
  );
}
