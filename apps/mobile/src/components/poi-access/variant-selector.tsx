import type { AccessVariant } from '@ridenrest/shared';
import { Pressable, Text, View } from 'react-native';

import { RouteIcon, TriangleAlertIcon } from '@/components/ui/icon';
import { useTranslation } from '@/lib/i18n';
import { formatAccessDistance, formatAccessEta } from './format';

// Sélecteur d'itinéraire d'accès (MOB-4.6 / T5, AC5 — parité web `VariantSelector`).
//
// - Chips (une par variante) : distance + ETA (`etaS` BRouter). Affiché **seulement** si
//   `variants.length > 1 && onSelect` (sinon pas de choix à offrir).
// - Avertissement ⚠️ « Route nationale » : si la variante AFFICHÉE a `usesMainRoad`,
//   montré **même avec une seule variante** (mécanisme « le cycliste arbitre le risque »
//   qui remplace l'ancien sélecteur de profil — divergence epic documentée).
// - `selectedVariantIndex` (défaut 0) + `onSelectVariant` sont **liftés à l'écran carte**
//   (MOB-4.7 a besoin du même index pour la polyline) ; reset au changement de POI.
//
// Couleurs (accent magenta `#e6007e`, ⚠️ rouge) = style **inline** (règle projet :
// jamais de couleur dynamique en classe Tailwind). Le magenta est cohérent avec la
// polyline d'accès (MOB-4.7).

// Accent de la variante sélectionnée — couleur du tracé d'accès sur la carte (MOB-4.7).
const ACCENT = '#e6007e';
// Avertissement danger (route nationale).
const WARN = '#ef4444';

interface VariantSelectorProps {
  variants: AccessVariant[];
  selected: number;
  onSelect?: (index: number) => void;
}

export function VariantSelector({
  variants,
  selected,
  onSelect,
}: VariantSelectorProps) {
  const { t } = useTranslation();

  // Choix d'itinéraires : utile seulement à partir de 2 variantes ET si la sélection
  // est câblée. L'avertissement nationale dépend, lui, de la variante AFFICHÉE.
  const showOptions = variants.length > 1 && !!onSelect;
  const selectedUsesMainRoad = variants[selected]?.usesMainRoad ?? false;

  // Rien à montrer : pas de choix multiple et pas de nationale à signaler.
  if (!showOptions && !selectedUsesMainRoad) return null;

  const warning = selectedUsesMainRoad ? (
    <View className="flex-row items-center gap-1" testID="access-main-road-warning">
      <TriangleAlertIcon size={14} color={WARN} />
      <Text className="text-xs font-montserrat-semibold" style={{ color: WARN }}>
        {t('pois.access.mainRoadWarning')}
      </Text>
    </View>
  ) : null;

  // Mono-variante (ou sélection non câblée) passant par une nationale : on n'affiche QUE
  // l'avertissement (ni label « Itinéraires », ni boutons de choix sans intérêt).
  if (!showOptions) {
    return <View className="pt-1">{warning}</View>;
  }

  return (
    <View className="gap-1.5" testID="access-variant-selector">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5">
          <RouteIcon size={14} className="text-text-secondary" />
          <Text className="text-xs font-montserrat-semibold uppercase text-text-secondary">
            {t('pois.access.variants')}
          </Text>
        </View>
        {warning}
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('pois.access.variantGroupA11y')}
        className="flex-row gap-1.5"
      >
        {variants.map((v, i) => {
          const isActive = i === selected;
          const a11yLabel = t('pois.access.variantA11y', {
            index: i + 1,
            distance: formatAccessDistance(v.distanceM),
            eta: formatAccessEta(v.etaS),
          });
          return (
            <Pressable
              key={i}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={
                v.usesMainRoad
                  ? `${a11yLabel} — ${t('pois.access.mainRoadWarning')}`
                  : a11yLabel
              }
              onPress={() => onSelect?.(i)}
              className="flex-1 items-center rounded-lg border px-2 py-2 active:opacity-80"
              style={{
                borderColor: isActive ? ACCENT : '#e5e7eb',
                backgroundColor: isActive ? 'rgba(230,0,126,0.08)' : 'transparent',
              }}
            >
              {v.usesMainRoad ? (
                <View className="absolute right-1 top-1">
                  <TriangleAlertIcon size={13} color={WARN} />
                </View>
              ) : null}
              <Text
                className="text-xs font-montserrat-semibold"
                style={{ color: isActive ? ACCENT : undefined }}
              >
                {formatAccessDistance(v.distanceM)}
              </Text>
              <Text
                className="text-xs font-montserrat text-text-secondary"
                style={isActive ? { color: ACCENT } : undefined}
              >
                {formatAccessEta(v.etaS)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
