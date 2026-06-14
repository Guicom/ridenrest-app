import { POI_LAYER_COLORS, type MapLayer } from '@ridenrest/shared';
import { Pressable, View } from 'react-native';

import {
  BedDoubleIcon,
  BikeIcon,
  ShoppingBasketIcon,
  UtensilsIcon,
  type LucideIcon,
} from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useMapStore } from '@/lib/stores/map.store';
import { useTranslation } from '@/lib/i18n';

// Grille de calques POI (carte Recherche) — port iso de `poi-layer-grid.tsx` web.
// 4 boutons icône pleine largeur (multi-sélection), couleur de calque en **style
// inline** (Tailwind JIT KO sur `bg-[${color}]`). Lit/écrit directement `useMapStore`
// (parité web). Pendant une recherche, le calque actif affiche un Skeleton à la place
// de l'icône. A11y : `switch` + `checked` + label i18n.

interface LayerCardConfig {
  layer: MapLayer;
  icon: LucideIcon;
  color: string;
}

const LAYER_CARDS: LayerCardConfig[] = [
  { layer: 'accommodations', icon: BedDoubleIcon, color: POI_LAYER_COLORS.accommodations },
  { layer: 'restaurants', icon: UtensilsIcon, color: POI_LAYER_COLORS.restaurants },
  { layer: 'supplies', icon: ShoppingBasketIcon, color: POI_LAYER_COLORS.supplies },
  { layer: 'bike', icon: BikeIcon, color: POI_LAYER_COLORS.bike },
];

export interface PoiLayerGridProps {
  isPending: boolean;
}

export function PoiLayerGrid({ isPending }: PoiLayerGridProps) {
  const { t } = useTranslation();
  const visibleLayers = useMapStore((s) => s.visibleLayers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);

  return (
    <View className="flex-row gap-2">
      {LAYER_CARDS.map(({ layer, icon: Icon, color }) => {
        const isActive = visibleLayers.has(layer);
        return (
          <Pressable
            key={layer}
            onPress={() => toggleLayer(layer)}
            accessibilityRole="switch"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={t(`pois.layers.${layer}`)}
            style={
              isActive
                ? { backgroundColor: color, borderColor: 'transparent' }
                : undefined
            }
            className={
              isActive
                ? 'h-12 flex-1 items-center justify-center rounded-xl'
                : 'h-12 flex-1 items-center justify-center rounded-xl border border-border bg-card'
            }
          >
            {isPending && isActive ? (
              <Skeleton className="h-5 w-5 rounded" />
            ) : (
              <Icon
                size={20}
                color={isActive ? '#ffffff' : undefined}
                className={isActive ? undefined : 'text-text-primary'}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
