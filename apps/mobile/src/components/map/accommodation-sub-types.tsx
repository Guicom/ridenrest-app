import {
  POI_CATEGORY_COLORS,
  type Poi,
  type PoiCategory,
} from '@ridenrest/shared';
import { Pressable, Text, View } from 'react-native';

import { useMapStore } from '@/lib/stores/map.store';
import { useTranslation } from '@/lib/i18n';

// Sous-types d'hébergement (carte Recherche) — port iso de `accommodation-sub-types.tsx`
// web. Chips colorées (pastille + label + compteur) lisant/écrivant `useMapStore`
// (`activeAccommodationTypes`). Couleurs en **style inline** (`POI_CATEGORY_COLORS`).
// Compteur calculé sur les POIs hébergement remontés ; 0 résultat → chip grisée.

export const ACCOMMODATION_SUB_TYPES: { type: PoiCategory; color: string }[] = [
  { type: 'hotel', color: POI_CATEGORY_COLORS.hotel },
  { type: 'camp_site', color: POI_CATEGORY_COLORS.camp_site },
  { type: 'shelter', color: POI_CATEGORY_COLORS.shelter },
  { type: 'hostel', color: POI_CATEGORY_COLORS.hostel },
  { type: 'guesthouse', color: POI_CATEGORY_COLORS.guesthouse },
];

/** Compte les POIs par sous-type — `null` si aucune donnée (pas de badge). Pur. */
export function computeAccCountByType(
  pois?: Poi[],
): Record<string, number> | null {
  if (!pois || pois.length === 0) return null;
  return pois.reduce<Record<string, number>>((acc, poi) => {
    acc[poi.category] = (acc[poi.category] ?? 0) + 1;
    return acc;
  }, {});
}

export interface AccommodationSubTypesProps {
  accommodationPois?: Poi[];
  /** Live mode : badge affiché seulement pour les types actifs (non utilisé en planning). */
  onlyCountActive?: boolean;
}

export function AccommodationSubTypes({
  accommodationPois,
  onlyCountActive = false,
}: AccommodationSubTypesProps) {
  const { t } = useTranslation();
  const activeAccommodationTypes = useMapStore(
    (s) => s.activeAccommodationTypes,
  );
  const toggleAccommodationType = useMapStore((s) => s.toggleAccommodationType);

  const countByType = computeAccCountByType(accommodationPois);

  return (
    <View>
      <Text className="mb-2 text-sm font-montserrat-semibold text-text-primary">
        {t('pois.search.accommodationTitle')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {ACCOMMODATION_SUB_TYPES.map(({ type, color }) => {
          const isActive = activeAccommodationTypes.has(type);
          const rawCount = countByType ? (countByType[type] ?? 0) : null;
          const count = onlyCountActive
            ? isActive && rawCount !== null && rawCount > 0
              ? rawCount
              : null
            : rawCount;
          const hasZeroResults = count !== null && count === 0;
          const label = t(`pois.category.${type}`);
          return (
            <Pressable
              key={type}
              onPress={() => toggleAccommodationType(type)}
              accessibilityRole="switch"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={label}
              style={
                isActive
                  ? { backgroundColor: color, borderColor: 'transparent' }
                  : undefined
              }
              className={
                isActive
                  ? 'flex-row items-center gap-2 rounded-full px-3 py-1.5'
                  : hasZeroResults
                    ? 'flex-row items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 opacity-50'
                    : 'flex-row items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5'
              }
            >
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: isActive
                    ? '#ffffff'
                    : hasZeroResults
                      ? '#9CA3AF'
                      : color,
                }}
              />
              <Text
                className={
                  isActive
                    ? 'text-sm font-montserrat-medium text-white'
                    : 'text-sm font-montserrat-medium text-text-primary'
                }
              >
                {label}
                {count !== null ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
