import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useCachePurge } from '@/hooks/use-cache-purge';
import { useTranslation } from '@/lib/i18n';

// Bouton « Vider le cache de cette aventure » (MOB-3.5 / AC4 — fallback manuel).
// Câblé dans le détail aventure (la purge est PAR aventure → l'écran settings global
// ne porte pas d'`adventureId`). Confirmation via `Alert` (action DESTRUCTIVE — tolérée,
// distincte d'un affichage d'erreur). Au succès, un message i18n transitoire confirme.

export interface ClearAdventureCacheButtonProps {
  adventureId: string;
  /** Ids des segments dont purger la trace GPX (`/cache/gpx/{id}.gpx`). */
  segmentIds?: string[];
  className?: string;
}

export function ClearAdventureCacheButton({
  adventureId,
  segmentIds = [],
  className,
}: ClearAdventureCacheButtonProps) {
  const { t } = useTranslation();
  const { clear, isPurging } = useCachePurge();
  const [done, setDone] = useState(false);

  function handlePress() {
    Alert.alert(t('settings.clearCache.label'), t('settings.clearCache.confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void clear(adventureId, segmentIds).then(() => setDone(true));
        },
      },
    ]);
  }

  return (
    <View className={className}>
      <Button
        variant="outline"
        label={t('settings.clearCache.label')}
        loading={isPurging}
        onPress={handlePress}
      />
      {done ? (
        <Text
          accessibilityRole="alert"
          className="mt-2 text-center text-sm font-montserrat text-text-muted"
        >
          {t('settings.clearCache.done')}
        </Text>
      ) : null}
    </View>
  );
}
