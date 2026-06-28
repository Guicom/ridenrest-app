import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollapsibleProfileSection } from '@/components/live/collapsible-profile-section';
import { SearchOnDropdown } from '@/components/map/search-on-dropdown';
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

// Panneau de contrôle Live **refondu** (MOB-5.4 / AC1) — port du re-design web
// `live-controls.tsx`. Ordre vertical des maquettes (FR-LP-001) :
//   (a) en-tête « PROFIL » + chevron  ┐ section PROFIL repliable
//   (b) section repliable (slot)      ┘ (coquille animée, MOB-5.5 alimente le contenu)
//   (c) séparateur + « MON HÔTEL DANS {X} km » + icône filtres
//   (d) slider distance cible + boutons −/+
//   (e) ligne métriques « ↑ D+ · ↓ D- · ~ ETA » SOUS le slider
//   (f) RECHERCHER / RECHERCHER SUR (SearchOnDropdown Booking/Airbnb)
//
// Frontend-only, aucun appel serveur (NFR-LP-005). 44 px sur toutes les cibles tactiles
// (NFR-LP-003). La logique slider/recherche/filtres provient de MOB-5.3 ; le contenu du
// profil d'élévation est MOB-5.5 (slot `profileContent`).

const SLIDER_STEP = 5;
const DEFAULT_MAX = 100;

/** Arrondi à l'inférieur au multiple de `step`. Pur → testable (T5). */
export function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

/**
 * Résumé ETA « ~Xh MM » / « ~Mmin » depuis distance + allure. `''` si allure ≤ 0.
 * Pur → testable (T5). Port du web `live-controls.tsx:formatEtaSummary`.
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
  /** Hauteur mesurée du panneau (px) → padding bas de l'auto-zoom (AC3 MOB-5.3). */
  onHeightChange?: (height: number) => void;
  /** D+ de la fenêtre `[currentKm, +targetAheadKm]` (m) — `null` si indisponible. */
  elevationGain: number | null;
  /** D- de la fenêtre `[currentKm, +targetAheadKm]` (m) — `null` si indisponible. */
  elevationLoss: number | null;
  /**
   * Centre de la plage de recherche (corridor) pour « RECHERCHER SUR » — `null` →
   * dropdown désactivé. RGPD : centre du corridor, jamais la position GPS.
   */
  searchCenter: { lat: number; lng: number } | null;
  /** Ville résolue (Booking `?ss=city`) — optionnel, repli coordonnées sinon. */
  city?: string | null;
  /** Section « PROFIL » ouverte (FR-LP-002..005) — état remonté à l'écran. */
  profileOpen: boolean;
  /** Toggle manuel de la section via le chevron (FR-LP-005). */
  onProfileToggle: () => void;
  /** Auto-open de la section au 1er contact slider / −/+ (FR-LP-003). */
  onProfileAutoOpen: () => void;
  /** Contenu de la section « PROFIL » (profil d'élévation — MOB-5.5). */
  profileContent?: ReactNode;
}

export function LiveControls({
  onFiltersOpen,
  onSearch,
  activeFilterCount,
  maxAheadKm,
  isOnline,
  onHeightChange,
  elevationGain,
  elevationLoss,
  searchCenter,
  city,
  profileOpen,
  onProfileToggle,
  onProfileAutoOpen,
  profileContent,
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

  // Auto-open de la section PROFIL au contact slider / −/+, PUIS applique la valeur
  // (FR-LP-003). `onProfileAutoOpen` est idempotent côté écran (`setProfileOpen(true)`).
  const changeTarget = (value: number) => {
    onProfileAutoOpen();
    setTargetAheadKm(value);
  };

  const sliderValue = Math.min(targetAheadKm, effectiveMax);
  const atMin = targetAheadKm <= SLIDER_STEP;
  const atMax = targetAheadKm >= effectiveMax;
  const etaSummary = formatEtaSummary(targetAheadKm, speedKmh);

  // Ligne métriques — joint UNIQUEMENT les valeurs présentes avec « · » (pas de
  // séparateur orphelin si une valeur manque, parité review web P3).
  const hasElevation = elevationGain != null || elevationLoss != null;
  const elevationText = (() => {
    const parts: string[] = [];
    if (elevationGain != null) parts.push(`↑ ${Math.round(elevationGain)} m`);
    if (elevationLoss != null) parts.push(`↓ ${Math.round(elevationLoss)} m`);
    return parts.length > 0 ? parts.join(' · ') : '—';
  })();

  // Libellé a11y de la ligne métriques (valeurs présentes uniquement).
  const metricsA11y = (() => {
    const parts: string[] = [];
    if (elevationGain != null)
      parts.push(t('live.panel.dPlus', { value: Math.round(elevationGain) }));
    if (elevationLoss != null)
      parts.push(t('live.panel.dMinus', { value: Math.round(elevationLoss) }));
    if (etaSummary) parts.push(t('live.panel.eta', { eta: etaSummary }));
    return parts.join(', ');
  })();

  const handleLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) onHeightChange?.(h);
  };

  return (
    <View
      testID="live-controls"
      onLayout={handleLayout}
      style={{ paddingBottom: insets.bottom + 12 }}
      className="absolute bottom-0 left-0 right-0 z-30 rounded-t-2xl border-t border-border bg-card px-4 pt-2"
    >
      {/* (a)(b) En-tête « PROFIL » + chevron + section repliable (slot MOB-5.5). */}
      <CollapsibleProfileSection
        open={profileOpen}
        onToggle={onProfileToggle}
        content={profileContent}
      />

      {/* (c) Séparateur + « MON HÔTEL DANS X km » + bouton filtres (badge). */}
      <View
        testID="profile-separator"
        className="flex-row items-start justify-between border-t border-border pt-2"
      >
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

      {/* (d) Slider distance cible + boutons −/+ (parité 16-24, désactivés aux bornes).
          Le contact slider / −/+ ouvre la section PROFIL (FR-LP-003). */}
      <View className="mt-3 flex-row items-center gap-2">
        <Pressable
          testID="btn-minus"
          accessibilityRole="button"
          accessibilityLabel={t('live.search.decrement')}
          disabled={atMin}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() =>
            !atMin && changeTarget(Math.max(SLIDER_STEP, targetAheadKm - SLIDER_STEP))
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
          onChange={changeTarget}
          onInteractStart={onProfileAutoOpen}
        />
        <Pressable
          testID="btn-plus"
          accessibilityRole="button"
          accessibilityLabel={t('live.search.increment')}
          disabled={atMax}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() =>
            !atMax && changeTarget(Math.min(effectiveMax, targetAheadKm + SLIDER_STEP))
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

      {/* (e) Ligne métriques « ↑ D+ · ↓ D- · ~ ETA » SOUS le slider (FR-LP-001). */}
      <View
        testID="metrics-row"
        accessible
        accessibilityLabel={metricsA11y || undefined}
        className="mt-2 flex-row items-center gap-2"
      >
        <Text
          testID="elevation-display"
          className="font-montserrat-semibold text-sm text-text-primary"
        >
          {elevationText}
        </Text>
        {etaSummary ? (
          <Text
            testID="eta-display"
            className="font-montserrat-semibold text-sm text-text-primary"
          >
            {hasElevation ? `· ${etaSummary}` : etaSummary}
          </Text>
        ) : null}
      </View>

      {/* (f) RECHERCHER (explicite — jamais auto, désactivé hors-ligne) / RECHERCHER SUR. */}
      <View className="mt-3 flex-row gap-3">
        <Button
          size="lg"
          className="flex-1 rounded-full"
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
        <SearchOnDropdown center={searchCenter} city={city} className="flex-1" />
      </View>
    </View>
  );
}
