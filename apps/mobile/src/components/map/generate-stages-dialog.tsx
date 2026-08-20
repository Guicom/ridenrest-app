import {
  DEFAULT_DEPARTURE_HOUR,
  DEFAULT_TARGET_KM_PER_DAY,
  MIN_TARGET_KM_PER_DAY,
  MAX_TARGET_KM_PER_DAY,
  POI_CATEGORY_COLORS,
  STAGE_GEN_MAX_OFFSET_KM,
  STAGE_GEN_MIN_ACCOMMODATIONS,
} from '@ridenrest/shared';
import type {
  AdventureStageResponse,
  GenerateStagesInput,
  PoiCategory,
  StageGenerationWarning,
} from '@ridenrest/shared';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';

// Formulaire de génération automatique des étapes (story 17.18) — port iso du web.
// Comme `stage-dialog.tsx`, la date se saisit en texte (« 2026-09-05 08:00 ») : pas de picker
// natif, donc zéro nouveau module. Le parent remonte le composant via `key` pour réinitialiser.

/** Types d'hébergement absents de Google Places — ils ne vivent que dans OSM. */
const OSM_ONLY_CATEGORIES: PoiCategory[] = ['shelter'];

/**
 * Ordre aligné sur les puces de sous-types (`accommodation-sub-types.tsx`), qui lisent leurs
 * libellés dans `pois.category.<type>` — on réutilise les mêmes clés, pas de doublon.
 */
const TYPE_ORDER: PoiCategory[] = [
  'hotel',
  'camp_site',
  'shelter',
  'hostel',
  'guesthouse',
];

export interface GenerateStagesDialogProps {
  open: boolean;
  stages: AdventureStageResponse[];
  activeAccommodationTypes: Set<PoiCategory>;
  searchRadiusKm: number;
  adventureStartDate: string | null;
  overpassEnabled: boolean;
  /** Le profil doit être chargé avant de déclencher une requête (règle 9). */
  profileReady: boolean;
  isGenerating: boolean;
  onSubmit: (input: GenerateStagesInput) => void;
  onClose: () => void;
}

/** `2026-09-05 08:00` — même convention de saisie que `stage-dialog.tsx`. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function defaultDeparture(
  stages: AdventureStageResponse[],
  adventureStartDate: string | null,
  mode: 'replace' | 'fill',
): string {
  if (mode === 'fill') {
    const last = [...stages].sort((a, b) => a.orderIndex - b.orderIndex).at(-1);
    if (last?.departureTime) {
      const next = new Date(last.departureTime);
      next.setDate(next.getDate() + 1);
      return toLocalInput(next);
    }
  }
  const base = adventureStartDate
    ? new Date(`${adventureStartDate}T00:00:00`)
    : new Date();
  base.setHours(DEFAULT_DEPARTURE_HOUR, 0, 0, 0);
  return toLocalInput(base);
}

export function GenerateStagesDialog({
  open,
  stages,
  activeAccommodationTypes,
  searchRadiusKm,
  adventureStartDate,
  overpassEnabled,
  profileReady,
  isGenerating,
  onSubmit,
  onClose,
}: GenerateStagesDialogProps) {
  const { t } = useTranslation();
  const hasExistingStages = stages.length > 0;
  const lastEndKm = useMemo(
    () => (hasExistingStages ? Math.max(...stages.map((s) => s.endKm)) : 0),
    [hasExistingStages, stages],
  );

  const [kmPerDay, setKmPerDay] = useState(String(DEFAULT_TARGET_KM_PER_DAY));
  const [maxElevation, setMaxElevation] = useState('');
  const [mode, setMode] = useState<'replace' | 'fill'>(
    hasExistingStages ? 'fill' : 'replace',
  );
  const [types, setTypes] = useState<Set<PoiCategory>>(
    () =>
      new Set(
        activeAccommodationTypes.size > 0
          ? activeAccommodationTypes
          : (['hotel'] as PoiCategory[]),
      ),
  );
  const [departure, setDeparture] = useState(() =>
    defaultDeparture(stages, adventureStartDate, hasExistingStages ? 'fill' : 'replace'),
  );
  const [confirmReplace, setConfirmReplace] = useState(false);

  const kmPerDayNum = Number(kmPerDay);
  const kmPerDayValid =
    Number.isFinite(kmPerDayNum) &&
    kmPerDayNum >= MIN_TARGET_KM_PER_DAY &&
    kmPerDayNum <= MAX_TARGET_KM_PER_DAY;
  const onlyOsmTypes =
    types.size > 0 && [...types].every((type) => OSM_ONLY_CATEGORIES.includes(type));
  const canSubmit = kmPerDayValid && types.size > 0 && profileReady && !isGenerating;

  const toggleType = (category: PoiCategory) => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const changeMode = (next: 'replace' | 'fill') => {
    setMode(next);
    setDeparture(defaultDeparture(stages, adventureStartDate, next));
  };

  const buildInput = (): GenerateStagesInput => {
    const firstDepartureAt = parseLocalInput(departure);
    return {
      targetKmPerDay: kmPerDayNum,
      ...(maxElevation.trim() !== ''
        ? { maxElevationGainM: Number(maxElevation) }
        : {}),
      accommodationTypes: [...types],
      radiusKm: searchRadiusKm,
      mode,
      overpassEnabled,
      ...(firstDepartureAt ? { firstDepartureAt } : {}),
      // Le serveur incrémente la date en gardant l'heure murale : il lui faut le fuseau.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  };

  const submit = () => {
    if (!canSubmit) return;
    if (mode === 'replace' && hasExistingStages) {
      setConfirmReplace(true);
      return;
    }
    onSubmit(buildInput());
  };

  if (confirmReplace) {
    return (
      <Dialog open onClose={() => setConfirmReplace(false)}>
        <DialogTitle>{t('map.stages.generate.confirmReplaceTitle')}</DialogTitle>
        <DialogBody>
          <Text className="text-sm font-montserrat text-text-muted">
            {t('map.stages.generate.confirmReplaceBody', { count: stages.length })}
          </Text>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="lg" onPress={() => setConfirmReplace(false)}>
            <Text className="text-sm font-montserrat-medium text-text-primary">
              {t('common.cancel')}
            </Text>
          </Button>
          <Button
            size="lg"
            onPress={() => {
              setConfirmReplace(false);
              onSubmit(buildInput());
            }}
            testID="generate-confirm-replace"
          >
            <Text className="text-sm font-montserrat-medium text-white">
              {t('map.stages.generate.confirmReplaceAction')}
            </Text>
          </Button>
        </DialogFooter>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t('map.stages.generate.title')}</DialogTitle>
      <DialogBody>
        <View className="gap-4">
          <View className="gap-1.5">
            <Text className="text-xs font-montserrat-medium text-text-primary">
              {t('map.stages.generate.kmPerDay')}
            </Text>
            <TextInput
              value={kmPerDay}
              onChangeText={setKmPerDay}
              keyboardType="numeric"
              accessibilityLabel={t('map.stages.generate.kmPerDay')}
              testID="generate-km-per-day"
              className="rounded-lg border border-border bg-surface px-3 py-2 font-montserrat text-text-primary"
            />
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.generate.kmPerDayHint', { max: STAGE_GEN_MAX_OFFSET_KM })}
            </Text>
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-montserrat-medium text-text-primary">
              {t('map.stages.generate.maxElevation')}
            </Text>
            <TextInput
              value={maxElevation}
              onChangeText={setMaxElevation}
              keyboardType="numeric"
              placeholder={t('map.stages.generate.maxElevationPlaceholder')}
              accessibilityLabel={t('map.stages.generate.maxElevation')}
              testID="generate-max-elevation"
              className="rounded-lg border border-border bg-surface px-3 py-2 font-montserrat text-text-primary"
            />
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.generate.maxElevationHint')}
            </Text>
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-montserrat-medium text-text-primary">
              {t('map.stages.generate.departure')}
            </Text>
            <TextInput
              value={departure}
              onChangeText={setDeparture}
              placeholder="2026-09-05 08:00"
              accessibilityLabel={t('map.stages.generate.departure')}
              testID="generate-departure"
              className="rounded-lg border border-border bg-surface px-3 py-2 font-montserrat text-text-primary"
            />
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.generate.departureHint')}
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-xs font-montserrat-medium text-text-primary">
              {t('map.stages.generate.types')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {TYPE_ORDER.map((type) => {
                const active = types.has(type);
                const label = t(`pois.category.${type}`);
                return (
                  <Pressable
                    key={type}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={label}
                    testID={`generate-type-${type}`}
                    onPress={() => toggleType(type)}
                    className="rounded-full border px-3 py-1"
                    style={
                      active
                        ? {
                            backgroundColor: POI_CATEGORY_COLORS[type],
                            borderColor: POI_CATEGORY_COLORS[type],
                          }
                        : undefined
                    }
                  >
                    <Text
                      className={`text-xs font-montserrat ${active ? 'text-white' : 'text-text-muted'}`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.generate.typesHint', {
                min: STAGE_GEN_MIN_ACCOMMODATIONS,
                radius: searchRadiusKm,
              })}
            </Text>
            {types.size === 0 ? (
              <Text className="text-xs font-montserrat text-destructive">
                {t('map.stages.generate.typesEmpty')}
              </Text>
            ) : null}
            {/* `density-medium` = l'ambre du design system ; il n'existe pas de token `warning`. */}
            {onlyOsmTypes ? (
              <Text className="text-xs font-montserrat text-density-medium">
                {t('map.stages.generate.osmOnlyWarning')}
              </Text>
            ) : null}
          </View>

          {hasExistingStages ? (
            <View className="gap-2">
              <Text className="text-xs font-montserrat-medium text-text-primary">
                {t('map.stages.generate.existingTitle')}
              </Text>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === 'fill' }}
                onPress={() => changeMode('fill')}
                testID="generate-mode-fill"
                className="gap-0.5"
              >
                <Text
                  className={`text-sm font-montserrat ${mode === 'fill' ? 'text-text-primary' : 'text-text-muted'}`}
                >
                  {mode === 'fill' ? '● ' : '○ '}
                  {t('map.stages.generate.modeFill', { km: Math.round(lastEndKm) })}
                </Text>
                <Text className="ml-4 text-xs font-montserrat text-text-muted">
                  {t('map.stages.generate.modeFillHint')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === 'replace' }}
                onPress={() => changeMode('replace')}
                testID="generate-mode-replace"
                className="gap-0.5"
              >
                <Text
                  className={`text-sm font-montserrat ${mode === 'replace' ? 'text-text-primary' : 'text-text-muted'}`}
                >
                  {mode === 'replace' ? '● ' : '○ '}
                  {t('map.stages.generate.modeReplace')}
                </Text>
                <Text className="ml-4 text-xs font-montserrat text-text-muted">
                  {t('map.stages.generate.modeReplaceHint', { count: stages.length })}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!profileReady ? (
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.generate.profileLoading')}
            </Text>
          ) : null}
          {isGenerating ? (
            <Text className="text-xs font-montserrat text-text-muted">
              {t('map.stages.generate.slowHint')}
            </Text>
          ) : null}
        </View>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="lg" onPress={onClose} disabled={isGenerating}>
          <Text className="text-sm font-montserrat-medium text-text-primary">
            {t('common.cancel')}
          </Text>
        </Button>
        <Button size="lg" onPress={submit} disabled={!canSubmit} testID="generate-submit">
          <Text className="text-sm font-montserrat-medium text-white">
            {isGenerating
              ? t('map.stages.generate.running')
              : t('map.stages.generate.submit')}
          </Text>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/**
 * Message d'un statut de génération.
 *
 * `no_accommodation` et `provider_unavailable` ont des messages **distincts** : annoncer une
 * absence alors qu'on n'a pas pu vérifier envoie l'utilisateur chercher un problème inexistant.
 */
export function stageGenerationMessage(
  warning: StageGenerationWarning,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const range =
    warning.fromKm !== null && warning.toKm !== null
      ? t('map.stages.generate.rangeBetween', {
          from: Math.round(warning.fromKm),
          to: Math.round(warning.toKm),
        })
      : '';

  switch (warning.code) {
    case 'no_accommodation':
      return t('map.stages.generate.warnNoAccommodation', { range });
    case 'provider_unavailable':
      return t('map.stages.generate.warnProviderUnavailable', { range });
    case 'no_elevation_data':
      return t('map.stages.generate.warnNoElevationData');
    case 'sparse_final_stage':
      return t('map.stages.generate.warnSparseFinalStage', { range });
    case 'truncated':
      return t('map.stages.generate.warnTruncated');
    case 'request_budget_reached':
      return t('map.stages.generate.warnRequestBudget');
    case 'unexpected_billing':
      return t('map.stages.generate.warnUnexpectedBilling');
  }
}
