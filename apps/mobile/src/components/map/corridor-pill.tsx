import { Text, View } from 'react-native';

import { formatInt } from '@/lib/format/distance';
import { useTranslation } from '@/lib/i18n';

// Pastille de corridor (bas de carte) — port iso du « corridor range pill » web mobile.
// Affiche la plage `from – to km` courante quand l'utilisateur a touché le slider
// (`searchRangeInteracted`). Informatif, non interactif.

export interface CorridorPillProps {
  fromKm: number;
  toKm: number;
}

export function CorridorPill({ fromKm, toKm }: CorridorPillProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return (
    <View
      pointerEvents="none"
      accessibilityRole="text"
      className="rounded-full bg-card/90 px-4 py-2"
    >
      <Text className="text-sm font-montserrat-semibold text-text-primary">
        {formatInt(fromKm, locale)} – {formatInt(toKm, locale)} km
      </Text>
    </View>
  );
}
