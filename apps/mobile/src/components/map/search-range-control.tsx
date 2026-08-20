import { computeElevationGain, computeElevationLoss } from '@ridenrest/gpx';
import {
  MAX_SEARCH_RADIUS_KM,
  MAX_SEARCH_RANGE_KM,
  type AdventureStageResponse,
  type MapWaypoint,
  type Poi,
} from '@ridenrest/shared';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AccommodationSubTypes } from '@/components/map/accommodation-sub-types';
import { PoiLayerGrid } from '@/components/map/poi-layer-grid';
import { SearchOnDropdown } from '@/components/map/search-on-dropdown';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
} from '@/components/ui/icon';
import { Slider } from '@/components/ui/slider';
import { useReverseCity } from '@/hooks/use-reverse-city';
import { getCorridorCenter } from '@/lib/booking-url';
import { formatInt } from '@/lib/format/distance';
import { useMapStore } from '@/lib/stores/map.store';
import { useTranslation } from '@/lib/i18n';

// Carte « Recherche » (mode planning) — port iso de `search-range-control.tsx` web.
// Modèle corridor = **position** (`fromKm`, slider) + **largeur** (`rangeKm`, stepper)
// → `toKm = fromKm + rangeKm`. Gate `searchCommitted` : la recherche POI ne part QU'au
// clic « Rechercher ». Lit/écrit `useMapStore`. RGPD : seuls segmentId + km cumulés
// partent à l'API (jamais de GPS).

const MAX_RANGE_KM = MAX_SEARCH_RANGE_KM;
const MAX_RADIUS_KM = MAX_SEARCH_RADIUS_KM;

// D+ cumulé de km 0 jusqu'à fromKm (mode normal)
function computeElevationToStart(
  waypoints: MapWaypoint[],
  fromKm: number,
): number | null {
  const toStart = waypoints.filter((w) => w.distKm <= fromKm);
  if (toStart.length < 2) return null;
  if (toStart.every((w) => w.ele == null)) return null;
  return computeElevationGain(
    toStart.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })),
  );
}

// D+ sur la plage [fromKm, toKm] — mode étape (référentiel relatif)
function computeElevationInRange(
  waypoints: MapWaypoint[],
  fromKm: number,
  toKm: number,
): number | null {
  const inRange = waypoints.filter(
    (w) => w.distKm >= fromKm && w.distKm <= toKm,
  );
  if (inRange.length < 2) return null;
  if (inRange.every((w) => w.ele == null)) return null;
  return computeElevationGain(
    inRange.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })),
  );
}

function computeLossToStart(
  waypoints: MapWaypoint[],
  fromKm: number,
): number | null {
  const toStart = waypoints.filter((w) => w.distKm <= fromKm);
  if (toStart.length < 2) return null;
  if (toStart.every((w) => w.ele == null)) return null;
  return computeElevationLoss(
    toStart.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })),
  );
}

function computeLossInRange(
  waypoints: MapWaypoint[],
  fromKm: number,
  toKm: number,
): number | null {
  const inRange = waypoints.filter(
    (w) => w.distKm >= fromKm && w.distKm <= toKm,
  );
  if (inRange.length < 2) return null;
  if (inRange.every((w) => w.ele == null)) return null;
  return computeElevationLoss(
    inRange.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })),
  );
}

/** Dropdown léger « À partir » (étape) — RN n'a pas de `<select>` natif. */
function StageSelect({
  stages,
  selectedStageId,
  onSelect,
}: {
  stages: AdventureStageResponse[];
  selectedStageId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = stages.find((s) => s.id === selectedStageId) ?? null;
  const currentLabel = selected ? selected.name : t('pois.search.fromStart');

  return (
    <View className="flex-row items-center gap-2">
      <Text className="shrink-0 text-sm font-montserrat text-text-muted">
        {t('pois.search.from')}
      </Text>
      <View className="flex-1">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={t('pois.search.from')}
          onPress={() => setOpen((v) => !v)}
          className="h-9 flex-row items-center justify-between rounded-md border border-border bg-background px-2"
        >
          <Text className="text-xs font-montserrat text-text-primary">
            {currentLabel}
          </Text>
          <ChevronDownIcon size={14} className="text-text-muted" />
        </Pressable>
        {open ? (
          <View className="mt-1 overflow-hidden rounded-md border border-border bg-card">
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="px-3 py-2"
            >
              <Text className="text-xs font-montserrat text-text-primary">
                {t('pois.search.fromStart')}
              </Text>
            </Pressable>
            {stages.map((stage) => (
              <Pressable
                key={stage.id}
                accessibilityRole="menuitem"
                onPress={() => {
                  onSelect(stage.id);
                  setOpen(false);
                }}
                className="px-3 py-2"
              >
                <Text className="text-xs font-montserrat text-text-primary">
                  {stage.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export interface SearchRangeControlProps {
  totalDistanceKm: number;
  waypoints: MapWaypoint[] | null;
  isPoisPending: boolean;
  accommodationPois?: Poi[];
  stages?: AdventureStageResponse[];
  isOnline: boolean;
}

export function SearchRangeControl({
  totalDistanceKm,
  waypoints,
  isPoisPending,
  accommodationPois,
  stages,
  isOnline,
}: SearchRangeControlProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [expanded, setExpanded] = useState(true);

  const fromKm = useMapStore((s) => s.fromKm);
  const toKm = useMapStore((s) => s.toKm);
  const setSearchRange = useMapStore((s) => s.setSearchRange);
  const visibleLayers = useMapStore((s) => s.visibleLayers);
  const selectedStageId = useMapStore((s) => s.selectedStageId);
  const setSelectedStageId = useMapStore((s) => s.setSelectedStageId);
  const setSearchCommitted = useMapStore((s) => s.setSearchCommitted);
  const searchCommitted = useMapStore((s) => s.searchCommitted);
  const searchRadiusKm = useMapStore((s) => s.searchRadiusKm);
  const setSearchRadius = useMapStore((s) => s.setSearchRadius);

  const [rangeKm, setRangeKm] = useState(() => toKm - fromKm);
  const [rangeInput, setRangeInput] = useState(() => String(toKm - fromKm));
  const [radiusInput, setRadiusInput] = useState(() => String(searchRadiusKm));
  // Le store borne la valeur (1..20) : l'input doit refléter ce qui est réellement appliqué.
  const [lastRadius, setLastRadius] = useState(searchRadiusKm);
  if (searchRadiusKm !== lastRadius) {
    setLastRadius(searchRadiusKm);
    setRadiusInput(String(searchRadiusKm));
  }

  // Sync rangeKm si le store est modifié externalement (render-phase derived state).
  const storeRange = toKm - fromKm;
  if (storeRange > 0 && storeRange !== rangeKm) {
    setRangeKm(storeRange);
    setRangeInput(String(storeRange));
  }

  const selectedStage = useMemo(
    () =>
      selectedStageId && stages
        ? (stages.find((s) => s.id === selectedStageId) ?? null)
        : null,
    [selectedStageId, stages],
  );
  const stageEndKm = selectedStage?.endKm ?? null;
  const relativeKm = stageEndKm != null ? Math.max(0, fromKm - stageEndKm) : null;

  const corridorCenter = useMemo(
    () =>
      searchCommitted &&
      visibleLayers.has('accommodations') &&
      waypoints &&
      waypoints.length > 0
        ? getCorridorCenter(waypoints, (fromKm + toKm) / 2)
        : null,
    [searchCommitted, visibleLayers, waypoints, fromKm, toKm],
  );
  const { city: corridorCity } = useReverseCity(corridorCenter);

  const elevationGain = useMemo(() => {
    if (!waypoints || waypoints.length < 2) return null;
    if (stageEndKm != null)
      return computeElevationInRange(waypoints, stageEndKm, fromKm);
    return computeElevationToStart(waypoints, fromKm);
  }, [waypoints, fromKm, stageEndKm]);

  const elevationLoss = useMemo(() => {
    if (!waypoints || waypoints.length < 2) return null;
    if (stageEndKm != null)
      return computeLossInRange(waypoints, stageEndKm, fromKm);
    return computeLossToStart(waypoints, fromKm);
  }, [waypoints, fromKm, stageEndKm]);

  const applyRange = (newRange: number) => {
    const clamped = Math.min(MAX_RANGE_KM, Math.max(1, newRange));
    setRangeKm(clamped);
    setRangeInput(String(clamped));
    setSelectedStageId(null);
    setSearchRange(fromKm, Math.min(fromKm + clamped, totalDistanceKm));
  };

  const handleSliderPosition = (sliderValue: number) => {
    const newFrom = stageEndKm != null ? stageEndKm + sliderValue : sliderValue;
    const newTo = Math.min(newFrom + rangeKm, totalDistanceKm);
    const effectiveRange = Math.round(newTo - newFrom);
    if (effectiveRange < rangeKm) {
      setRangeKm(effectiveRange);
      setRangeInput(String(effectiveRange));
    }
    setSearchRange(newFrom, newTo);
  };

  const handleRangeInputBlur = () => {
    const parsed = parseInt(rangeInput, 10);
    if (!isNaN(parsed) && parsed !== rangeKm) applyRange(parsed);
    else setRangeInput(String(rangeKm));
  };

  // Rayon autour de la trace — mêmes règles que la plage : bornage à la validation, saisie
  // invalide réécrite avec la valeur courante plutôt que rejetée en silence.
  const applyRadius = (km: number) => {
    setSearchRadius(Math.min(MAX_RADIUS_KM, Math.max(1, Math.round(km))));
  };

  const handleRadiusInputBlur = () => {
    const parsed = parseInt(radiusInput, 10);
    if (!isNaN(parsed) && parsed !== searchRadiusKm) applyRadius(parsed);
    else setRadiusInput(String(searchRadiusKm));
  };

  // Valeurs affichées selon le mode (normal / étape)
  const displayKm = relativeKm != null ? Math.round(relativeKm) : Math.round(fromKm);
  const sliderMax =
    stageEndKm != null ? Math.max(0, totalDistanceKm - stageEndKm) : totalDistanceKm;
  const sliderValue = relativeKm != null ? relativeKm : fromKm;
  const sliderEndLabel =
    stageEndKm != null
      ? Math.round(totalDistanceKm - stageEndKm)
      : Math.round(totalDistanceKm);

  const searchDisabled = fromKm >= toKm || totalDistanceKm === 0;

  return (
    <Card>
      {/* En-tête repliable */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center justify-between"
      >
        <View className="flex-row items-center gap-2">
          <SearchIcon size={16} className="text-text-primary" />
          <Text className="text-sm font-montserrat-medium text-text-primary">
            {t('pois.search.title')}
          </Text>
        </View>
        {expanded ? (
          <ChevronUpIcon size={16} className="text-text-muted" />
        ) : (
          <ChevronDownIcon size={16} className="text-text-muted" />
        )}
      </Pressable>

      {expanded ? (
        <View className="mt-4 gap-4">
          {/* À partir (étape) — seulement si des étapes existent */}
          {stages && stages.length > 0 ? (
            <StageSelect
              stages={stages}
              selectedStageId={selectedStageId}
              onSelect={(id) => {
                if (!id) {
                  setSelectedStageId(null);
                  return;
                }
                const stage = stages.find((s) => s.id === id);
                if (!stage) return;
                const from = stage.endKm;
                const to = Math.min(totalDistanceKm, stage.endKm + rangeKm);
                const effectiveRange = Math.round(to - from);
                if (effectiveRange < rangeKm) {
                  setRangeKm(effectiveRange);
                  setRangeInput(String(effectiveRange));
                }
                setSelectedStageId(id);
                setSearchRange(from, to);
              }}
            />
          ) : null}

          {/* Position + D+/D− dynamiques */}
          <View className="flex-row items-center gap-3">
            <Text className="text-sm font-montserrat-semibold text-text-primary">
              {formatInt(displayKm, locale)} km
            </Text>
            {elevationGain != null ? (
              <Text className="text-sm font-montserrat text-text-muted">
                {formatInt(elevationGain, locale)}m D+
                {elevationLoss != null
                  ? ` · ${formatInt(elevationLoss, locale)}m D-`
                  : ''}
              </Text>
            ) : (
              <Text className="text-sm font-montserrat text-text-muted">
                ↑ — m D+ · ↓ — m D-
              </Text>
            )}
          </View>

          {/* Slider position + boutons ± */}
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pois.search.stepBack')}
                disabled={sliderValue <= 0}
                onPress={() => handleSliderPosition(Math.max(0, sliderValue - 1))}
                className={
                  sliderValue <= 0
                    ? 'h-7 w-7 items-center justify-center rounded-full border border-primary opacity-50'
                    : 'h-7 w-7 items-center justify-center rounded-full border border-primary'
                }
              >
                <MinusIcon size={14} className="text-primary" />
              </Pressable>
              <Slider
                className="flex-1"
                min={0}
                max={Math.max(sliderMax, 1)}
                value={sliderValue}
                onChange={handleSliderPosition}
                label={t('pois.search.positionA11y')}
                testID="position-slider"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pois.search.stepForward')}
                disabled={sliderValue >= sliderMax}
                onPress={() =>
                  handleSliderPosition(Math.min(sliderMax, sliderValue + 1))
                }
                className={
                  sliderValue >= sliderMax
                    ? 'h-7 w-7 items-center justify-center rounded-full border border-primary opacity-50'
                    : 'h-7 w-7 items-center justify-center rounded-full border border-primary'
                }
              >
                <PlusIcon size={14} className="text-primary" />
              </Pressable>
            </View>
            <View className="flex-row justify-between px-9">
              <Text className="text-[10px] font-montserrat text-text-muted">
                0 km
              </Text>
              <Text className="text-[10px] font-montserrat text-text-muted">
                {sliderEndLabel} km
              </Text>
            </View>
          </View>

          {/* Calques POI */}
          <PoiLayerGrid isPending={isPoisPending} />

          {/* Sous-types hébergement (si calque actif) */}
          {visibleLayers.has('accommodations') ? (
            <AccommodationSubTypes accommodationPois={accommodationPois} />
          ) : null}

          {/* Largeur de recherche */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-montserrat text-text-muted">
              {t('pois.search.rangeLabel')}
            </Text>
            <View className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pois.search.rangeDecrement')}
                disabled={rangeKm <= 1}
                onPress={() => applyRange(rangeKm - 1)}
                className={
                  rangeKm <= 1
                    ? 'h-7 w-7 items-center justify-center rounded-lg bg-muted opacity-50'
                    : 'h-7 w-7 items-center justify-center rounded-lg bg-muted'
                }
              >
                <MinusIcon size={14} className="text-text-primary" />
              </Pressable>
              <View className="flex-row items-center gap-1">
                <TextInput
                  value={rangeInput}
                  onChangeText={setRangeInput}
                  onBlur={handleRangeInputBlur}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  accessibilityLabel={t('pois.search.rangeLabel')}
                  testID="range-input"
                  className="w-10 border-b border-border text-center text-sm font-montserrat-semibold text-text-primary"
                />
                <Text className="text-sm font-montserrat-semibold text-text-primary">
                  km
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pois.search.rangeIncrement')}
                disabled={rangeKm >= MAX_RANGE_KM}
                onPress={() => applyRange(rangeKm + 1)}
                className={
                  rangeKm >= MAX_RANGE_KM
                    ? 'h-7 w-7 items-center justify-center rounded-lg bg-muted opacity-50'
                    : 'h-7 w-7 items-center justify-center rounded-lg bg-muted'
                }
              >
                <PlusIcon size={14} className="text-text-primary" />
              </Pressable>
            </View>
          </View>

          {/* Rayon autour de la trace — même contrôle qu'en mode live, où il existait déjà. */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-montserrat text-text-muted">
              {t('pois.search.radiusLabel')}
            </Text>
            <View className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pois.search.radiusDecrement')}
                disabled={searchRadiusKm <= 1}
                hitSlop={12}
                onPress={() => applyRadius(searchRadiusKm - 1)}
                className={
                  searchRadiusKm <= 1
                    ? 'h-7 w-7 items-center justify-center rounded-lg bg-muted opacity-50'
                    : 'h-7 w-7 items-center justify-center rounded-lg bg-muted'
                }
              >
                <MinusIcon size={14} className="text-text-primary" />
              </Pressable>
              <View className="flex-row items-center gap-1">
                <TextInput
                  value={radiusInput}
                  onChangeText={setRadiusInput}
                  onBlur={handleRadiusInputBlur}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  accessibilityLabel={t('pois.search.radiusLabel')}
                  testID="radius-input"
                  className="w-10 border-b border-border text-center text-sm font-montserrat-semibold text-text-primary"
                />
                <Text className="text-sm font-montserrat-semibold text-text-primary">
                  km
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pois.search.radiusIncrement')}
                disabled={searchRadiusKm >= MAX_RADIUS_KM}
                hitSlop={12}
                onPress={() => applyRadius(searchRadiusKm + 1)}
                className={
                  searchRadiusKm >= MAX_RADIUS_KM
                    ? 'h-7 w-7 items-center justify-center rounded-lg bg-muted opacity-50'
                    : 'h-7 w-7 items-center justify-center rounded-lg bg-muted'
                }
              >
                <PlusIcon size={14} className="text-text-primary" />
              </Pressable>
            </View>
          </View>

          {/* CTA Rechercher (gate explicite AC2) */}
          <Button
            size="lg"
            label={t('pois.search.button')}
            disabled={searchDisabled}
            onPress={isOnline ? () => setSearchCommitted(true) : undefined}
          />
          {!isOnline ? (
            <Text className="text-center text-xs font-montserrat text-text-muted">
              {t('pois.search.offline')}
            </Text>
          ) : null}

          {/* Rechercher sur Booking/Airbnb — après recherche, calque hébergement actif */}
          {searchCommitted &&
          !isPoisPending &&
          visibleLayers.has('accommodations') ? (
            <SearchOnDropdown center={corridorCenter} city={corridorCity} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
