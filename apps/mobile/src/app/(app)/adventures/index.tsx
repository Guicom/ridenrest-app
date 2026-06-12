import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

// PLACEHOLDER (MOB-2.1 / frontière de story). Écran-cible des utilisateurs connectés
// (prouve le guard `(app)` + la persistance de session au cold start, AC3). La
// **liste réelle** des aventures (TanStack Query → API NestJS) arrive en **MOB-3.1**.
// Le logout UI réel arrive en **MOB-2.5** (suppression de compte / RGPD).
//
// Lien Paramètres ajouté en MOB-2.4 : point d'entrée vers l'intégration Strava (AC1).
// La vraie navigation (header/onglets) arrivera avec les écrans MOB-3.x.
export default function AdventuresScreen() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background-page p-6">
      <Text className="text-2xl font-montserrat-bold text-text-primary">
        {t('auth.adventures.title')}
      </Text>
      <Text className="text-center text-sm font-montserrat text-text-muted">
        {t('auth.adventures.placeholder')}
      </Text>
      <Button
        variant="outline"
        size="lg"
        label={t('auth.adventures.settingsLink')}
        onPress={() => router.push('/(app)/settings')}
      />
    </View>
  );
}
