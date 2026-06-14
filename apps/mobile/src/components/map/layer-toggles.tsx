import { POI_LAYER_COLORS, type MapLayer } from '@ridenrest/shared';
import { Pressable, View } from 'react-native';

import {
  BedDoubleIcon,
  BikeIcon,
  ShoppingBasketIcon,
  UtensilsIcon,
  type LucideIcon,
} from '@/components/ui/icon';
import { ALL_MAP_LAYERS } from '@/hooks/use-poi-layers';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n';

// Boutons de calque POI (MOB-4.2 / AC1, T3). 4 toggles indépendants (multi-sélection)
// — parité web sidebar. Couleur de calque = `POI_LAYER_COLORS` en **style inline**
// (Tailwind JIT KO sur `bg-[${color}]`, archi L632/L770). Cible tactile ≥ 44×44 px.
//
// A11y : `accessibilityRole="switch"` + `accessibilityState.checked` + label i18n par
// calque (le toggle est annoncé « activé/désactivé » par le lecteur d'écran).

const LAYER_ICONS: Record<MapLayer, LucideIcon> = {
  accommodations: BedDoubleIcon,
  restaurants: UtensilsIcon,
  supplies: ShoppingBasketIcon,
  bike: BikeIcon,
};

export interface LayerTogglesProps {
  visibleLayers: Set<MapLayer>;
  onToggle: (layer: MapLayer) => void;
  className?: string;
}

export function LayerToggles({
  visibleLayers,
  onToggle,
  className,
}: LayerTogglesProps) {
  const { t } = useTranslation();

  return (
    <View className={cn('flex-row gap-2', className)}>
      {ALL_MAP_LAYERS.map((layer) => {
        const Icon = LAYER_ICONS[layer];
        const active = visibleLayers.has(layer);
        const color = POI_LAYER_COLORS[layer];
        const label = t(`pois.layers.${layer}`);
        return (
          <Pressable
            key={layer}
            accessibilityRole="switch"
            accessibilityState={{ checked: active }}
            accessibilityLabel={label}
            onPress={() => onToggle(layer)}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-full border bg-card/90',
              active ? '' : 'border-border',
            )}
            // Couleur dynamique du calque → style inline (jamais Tailwind JIT).
            // Actif : liseré + fond teinté (alpha hex 8 chiffres). Inactif : neutre.
            style={active ? { borderColor: color, backgroundColor: `${color}22` } : undefined}
          >
            <Icon
              size={22}
              // Actif : couleur de calque (prop directe lucide). Inactif : token muté.
              color={active ? color : undefined}
              className={active ? undefined : 'text-text-muted'}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
