import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetworkStatus } from '@/hooks/use-network-status';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n';

// Bandeau d'état GLOBAL non bloquant (MOB-3.5 / AC2-3). DISTINCT de `<ErrorBanner>`
// (inline form). Monté UNE fois au root (`_layout.tsx`) au-dessus du `<Stack>`,
// piloté par `useNetworkStatus` → visible **uniquement** offline. Jamais `Alert.alert`
// pour l'état offline (anti-pattern archi). NativeWind (`className`), live-region
// pour l'annonce lecteur d'écran.
//
// `message` optionnel : override de test/usage ; par défaut `offline.banner` (i18n).

export interface StatusBannerProps {
  /** Override du message (sinon `t('offline.banner')`). */
  message?: string;
  /** Force l'affichage (tests/preview). Par défaut piloté par la connectivité. */
  forceVisible?: boolean;
}

export function StatusBanner({ message, forceVisible }: StatusBannerProps) {
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  const visible = forceVisible ?? !isOnline;
  if (!visible) return null;

  return (
    <View
      // Live-region : le lecteur d'écran annonce l'apparition sans voler le focus.
      // `accessible` regroupe le bandeau en UN seul élément a11y (le rôle `alert`
      // n'est sinon pas exposé sur une `View` non accessible — iOS).
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      // Bandeau sticky en haut, sous la status bar / Dynamic Island.
      style={{ paddingTop: insets.top + 8 }}
      className={cn(
        'absolute left-0 right-0 top-0 z-50 bg-text-muted px-4 pb-2',
      )}
    >
      <Text className="text-center text-sm font-montserrat-semibold text-white">
        {message ?? t('offline.banner')}
      </Text>
    </View>
  );
}
