import { useEffect } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import {
  MinusIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from '@/components/ui/icon';
import { Slider } from '@/components/ui/slider';
import { useLiveStore } from '@/lib/stores/live.store';
import { useTranslation } from '@/lib/i18n';

// Panneau de contrôle Live **fonctionnel** (MOB-5.3 / AC1, 2, 4) — port du web
// `live-controls.tsx`. Le **re-design** du layout (ordre maquettes, métriques
// « ↑D+ · ↓D- · ~ETA », slot « RECHERCHER SUR ») + la **section PROFIL repliable** sont
// la story **MOB-5.4**. Ici : version minimale = en-tête « MON HÔTEL DANS X km », slider
// distance cible avec boutons −/+ (max dynamique), ligne ETA, bouton RECHERCHER, bouton
// filtres (badge). La saisie d'allure se fait dans le tiroir filtres (T7).

const SLIDER_STEP = 5;
const DEFAULT_MAX = 100;

/** Arrondi à l'inférieur au multiple de `step`. Pur → testable (T10). */
export function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

/**
 * Résumé ETA « ~Xh MM » / « ~Mmin » depuis distance + allure. `''` si allure ≤ 0.
 * Pur → testable (T10). Port du web `live-controls.tsx:formatEtaSummary`.
 */
export function formatEtaSummary(distanceKm: number, speedKmh: number): string {
  if (speedKmh <= 0) return '';
  const totalMinutes = Math.round((distanceKm / speedKmh) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `~${h}h${String(m).padStart(2, '0')}` : `~${m}min`;
}

export interface LiveControlsProps {
  onFiltersOpen: () => void;
  onSearch: () => void;
  /** Nombre de filtres actifs (badge sur le bouton filtres). */
  activeFilterCount: number;
  /** Max km en avant = distance restante (`ceil(totalDist − currentKm)`). Défaut 100. */
  maxAheadKm?: number;
  /** Réseau accessible — sinon RECHERCHER désactivé. */
  isOnline: boolean;
  /** Hauteur mesurée du panneau (px) → padding bas de l'auto-zoom (AC3). */
  onHeightChange?: (height: number) => void;
}

export function LiveControls({
  onFiltersOpen,
  onSearch,
  activeFilterCount,
  maxAheadKm,
  isOnline,
  onHeightChange,
}: LiveControlsProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm);
  const speedKmh = useLiveStore((s) => s.speedKmh);
  const setTargetAheadKm = useLiveStore((s) => s.setTargetAheadKm);

  // Max effectif du slider : arrondi inférieur au pas, plancher 5 (AC1, parité 16-20).
  const effectiveMax = Math.max(
    SLIDER_STEP,
    roundDownToStep(maxAheadKm ?? DEFAULT_MAX, SLIDER_STEP),
  );

  // Clamp `targetAheadKm` quand le max rétrécit sous la valeur courante (AC1, 16-20).
  useEffect(() => {
    if (targetAheadKm > effectiveMax) setTargetAheadKm(effectiveMax);
  }, [effectiveMax, targetAheadKm, setTargetAheadKm]);

  const sliderValue = Math.min(targetAheadKm, effectiveMax);
  const atMin = targetAheadKm <= SLIDER_STEP;
  const atMax = targetAheadKm >= effectiveMax;
  const etaSummary = formatEtaSummary(targetAheadKm, speedKmh);

  const handleLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) onHeightChange?.(h);
  };

  return (
    <View
      testID="live-controls"
      onLayout={handleLayout}
      style={{ paddingBottom: insets.bottom + 12 }}
      className="absolute bottom-0 left-0 right-0 z-30 rounded-t-2xl border-t border-border bg-card px-4 pt-3"
    >
      {/* En-tête : « MON HÔTEL DANS X km » + bouton filtres (badge). */}
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-xs font-montserrat-semibold uppercase tracking-wide text-text-secondary">
            {t('live.search.targetLabel')}
          </Text>
          <Text className="font-montserrat-bold text-4xl leading-none text-primary">
            {`${targetAheadKm} km`}
          </Text>
        </View>
        <Pressable
          testID="btn-filters"
          accessibilityRole="button"
          accessibilityLabel={t('live.search.filters')}
          onPress={onFiltersOpen}
          className="h-11 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <SlidersHorizontalIcon size={18} color="#ffffff" />
          {activeFilterCount > 0 ? (
            <View className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full border border-primary bg-card px-1">
              <Text className="text-[10px] font-montserrat-bold text-primary">
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Slider distance cible + boutons −/+ (parité 16-24, désactivés aux bornes). */}
      <View className="mt-3 flex-row items-center gap-2">
        <Pressable
          testID="btn-minus"
          accessibilityRole="button"
          accessibilityLabel={t('live.search.decrement')}
          disabled={atMin}
          onPress={() =>
            !atMin && setTargetAheadKm(Math.max(SLIDER_STEP, targetAheadKm - SLIDER_STEP))
          }
          className={
            atMin
              ? 'h-8 w-8 items-center justify-center rounded-full border border-primary opacity-50'
              : 'h-8 w-8 items-center justify-center rounded-full border border-primary active:bg-muted'
          }
        >
          <MinusIcon size={16} className="text-primary" />
        </Pressable>
        <Slider
          testID="slider-target"
          className="flex-1"
          value={sliderValue}
          min={SLIDER_STEP}
          max={effectiveMax}
          step={SLIDER_STEP}
          label={t('live.search.distanceSliderA11y')}
          onChange={setTargetAheadKm}
        />
        <Pressable
          testID="btn-plus"
          accessibilityRole="button"
          accessibilityLabel={t('live.search.increment')}
          disabled={atMax}
          onPress={() =>
            !atMax && setTargetAheadKm(Math.min(effectiveMax, targetAheadKm + SLIDER_STEP))
          }
          className={
            atMax
              ? 'h-8 w-8 items-center justify-center rounded-full border border-primary opacity-50'
              : 'h-8 w-8 items-center justify-center rounded-full border border-primary active:bg-muted'
          }
        >
          <PlusIcon size={16} className="text-primary" />
        </Pressable>
      </View>

      {/* Ligne ETA (D+/D- + mise en forme « ↑D+ · ↓D- · ~ETA » = re-design MOB-5.4). */}
      {etaSummary ? (
        <Text
          testID="eta-display"
          accessibilityLabel={t('live.search.etaA11y', { eta: etaSummary })}
          className="mt-2 font-montserrat-semibold text-sm text-text-primary"
        >
          {etaSummary}
        </Text>
      ) : null}

      {/* RECHERCHER (explicite — jamais auto). Désactivé hors-ligne. */}
      <Button
        size="lg"
        className="mt-3 rounded-full"
        testID="btn-search"
        disabled={!isOnline}
        accessibilityLabel={t('live.search.searchButton')}
        onPress={onSearch}
      >
        <SearchIcon size={16} color="#ffffff" />
        <Text className="text-sm font-montserrat-semibold text-primary-foreground">
          {t('live.search.searchButton')}
        </Text>
      </Button>
    </View>
  );
}
