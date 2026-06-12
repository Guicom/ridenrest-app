import { Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/client';
import { useTranslation } from '@/lib/i18n';

// PLACEHOLDER (MOB-2.1 / frontière de story). Écran-cible des utilisateurs connectés
// (prouve le guard `(app)` + la persistance de session au cold start, AC3). La
// **liste réelle** des aventures (TanStack Query → API NestJS) arrive en **MOB-3.1**.
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

      {/* TODO(MOB-2.2 T7): bouton DEV TEMPORAIRE pour valider signup/login/reset
          (pas de logout UI avant MOB-2.5). À RETIRER après la validation manuelle. */}
      <Button
        variant="outline"
        size="lg"
        label="Déconnexion (DEV — T7)"
        onPress={() => {
          void signOut();
        }}
      />
    </View>
  );
}
