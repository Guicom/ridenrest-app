import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '@/lib/i18n';

// Bannière « Aucun résultat » Live (MOB-5.3 / AC5) — composant présentiel pur. Affichée
// au-dessus du panneau Live (haut de l'écran), conditionnée par l'écran sur
// `hasFetched && pois.length === 0` (JAMAIS `pois.length === 0` seul — vrai avant toute
// recherche). Voile orange non bloquant (`pointerEvents="none"`).

export interface LiveNoResultsBannerProps {
  visible: boolean;
}

export function LiveNoResultsBanner({ visible }: LiveNoResultsBannerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={{ top: insets.top + 56 }}
      className="absolute left-0 right-0 z-40 items-center px-4"
    >
      <View
        accessibilityRole="alert"
        className="rounded-lg bg-orange-500/90 px-4 py-2"
      >
        <Text className="text-center text-sm font-montserrat-semibold text-white">
          {t('live.search.noResults')}
        </Text>
      </View>
    </View>
  );
}
