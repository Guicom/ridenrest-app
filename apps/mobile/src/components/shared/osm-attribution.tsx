import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n';

// Attribution OpenStreetMap (MOB-4.1 / AC3 — FR-036, NFR-044). Overlay coin bas-
// gauche, **toujours rendu** tant que la carte est montée et **jamais masqué** par
// les overlays POI/densité/accès des stories suivantes (position fixe, hors flux).
//
// Le texte « © OpenStreetMap contributors » est un nom propre (non traduit) ; seul
// le **label a11y** passe par `t()`. Fond semi-opaque thème-safe (lisible light/dark).
// Tuiles OpenFreeMap = données OSM → l'attribution OSM couvre la licence des tuiles.

export interface OsmAttributionProps {
  className?: string;
}

export function OsmAttribution({ className }: OsmAttributionProps) {
  const { t } = useTranslation();
  return (
    <View
      // Décoratif/non interactif : ne capture pas les gestes carte au-dessus.
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel={t('map.attributionA11y')}
      className={cn(
        'absolute bottom-2 left-2 rounded bg-card/80 px-1.5 py-0.5',
        className,
      )}
    >
      <Text className="text-[10px] font-montserrat text-text-muted">
        © OpenStreetMap contributors
      </Text>
    </View>
  );
}
