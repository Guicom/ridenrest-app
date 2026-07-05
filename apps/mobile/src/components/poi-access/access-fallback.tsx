import { Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { formatAccessDistance } from './format';

// Rendu de repli quand BRouter est indisponible (status `fallback`, MOB-4.6 / T4, AC3) :
// distance à vol d'oiseau (`fallbackDistanceM`), signalée **approximative** via un badge
// « ≈ approximatif » + une explication, le tout visuellement discret (muted).

interface AccessFallbackProps {
  fallbackDistanceM: number;
}

export function AccessFallback({ fallbackDistanceM }: AccessFallbackProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  return (
    <View className="gap-1" testID="access-fallback">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm font-montserrat-medium text-text-secondary">
          {formatAccessDistance(fallbackDistanceM, locale)}
        </Text>
        <View className="rounded-full border border-border px-2 py-0.5">
          <Text className="text-xs font-montserrat text-text-muted">
            {t('pois.access.fallbackBadge')}
          </Text>
        </View>
      </View>
      <Text className="text-xs font-montserrat text-text-muted">
        {t('pois.access.fallbackHint')}
      </Text>
    </View>
  );
}
