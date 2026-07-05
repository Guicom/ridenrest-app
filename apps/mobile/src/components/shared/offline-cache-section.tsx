import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useOfflineCache } from '@/hooks/use-offline-cache';
import { useTranslation } from '@/lib/i18n';

// Section « Cache hors ligne » des Paramètres (MOB-3.5 / AC4 — fallback manuel
// GLOBAL). Vide TOUT le cache offline (traces GPX + POIs + météo de toutes les
// aventures), y compris les aventures sans dates jamais purgées automatiquement.
// Affichée UNIQUEMENT s'il existe réellement du cache (sinon `null`) + texte
// explicatif. Confirmation via `Alert` (action DESTRUCTIVE — tolérée, distincte d'un
// affichage d'erreur). Pendant `online` comme `offline` (purge locale, pas réseau).
export function OfflineCacheSection() {
  const { t } = useTranslation();
  const { hasCache, isClearing, clearAll } = useOfflineCache();
  const [done, setDone] = useState(false);

  // Rien à montrer s'il n'y a pas de cache (et qu'on n'en vient pas d'en vider un).
  if (!hasCache && !done) return null;

  function handlePress() {
    Alert.alert(
      t('settings.offlineCache.clear'),
      t('settings.offlineCache.confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            // `.catch` : la purge FS est best-effort (cf. cache-manager) ; on garde
            // le garde-fou anti red-box RN, cohérent avec le reste du code offline.
            void clearAll()
              .then(() => setDone(true))
              .catch(() => {});
          },
        },
      ],
    );
  }

  return (
    <View className="gap-3">
      <Text className="px-1 text-xs font-montserrat-semibold uppercase text-text-muted">
        {t('settings.offlineCache.title')}
      </Text>
      <Card className="gap-3">
        <Text className="text-sm font-montserrat text-text-muted">
          {t('settings.offlineCache.description')}
        </Text>
        {done ? (
          <Text
            accessibilityRole="alert"
            className="text-sm font-montserrat-semibold text-text-primary"
          >
            {t('settings.offlineCache.done')}
          </Text>
        ) : (
          <Button
            variant="outline"
            label={t('settings.offlineCache.clear')}
            loading={isClearing}
            onPress={handlePress}
          />
        )}
      </Card>
    </View>
  );
}
