import { MAX_LIVE_RADIUS_KM, type Poi } from '@ridenrest/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AccommodationSubTypes,
} from '@/components/map/accommodation-sub-types';
import { PoiLayerGrid } from '@/components/map/poi-layer-grid';
import {
  MinusIcon,
  PlusIcon,
  ThermometerIcon,
  UmbrellaIcon,
  WindIcon,
  XIcon,
  type LucideIcon,
} from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { useLiveStore } from '@/lib/stores/live.store';
import { useMapStore, type WeatherDimension } from '@/lib/stores/map.store';
import { useTranslation } from '@/lib/i18n';

// Tiroir de filtres Live (MOB-5.3 / AC7) — port du web `live-filters-drawer.tsx`.
//
// **Choix d'implémentation (documenté)** : tiroir = `Animated` glissant du bas +
// drag-to-dismiss `PanResponder` (même approche que `planning-sidebar.tsx` / `slider.tsx`),
// PAS `@gorhom/bottom-sheet` — pour éviter de câbler `GestureHandlerRootView` + provider
// au root de l'app (risque de régression app-wide), cohérent avec le choix mobile d'éviter
// reanimated/gesture-handler dans les primitives. Comportement AC7 identique.
//
// **Persist à la fermeture (16-25, AC7)** : sur **toute** fermeture (✕, swipe bas, tap
// overlay), `localRadius`/`localSpeed` sont commités au store (`setSearchRadius`/
// `setSpeedKmh`) — pas de bouton « Appliquer », pas de re-recherche silencieuse. Les
// toggles calques/sous-types écrivent le store **immédiatement** (état non local).
//
// **Section météo (MOB-5.6)** : toggle « Afficher sur la carte » (`weatherActive`,
// store carte, immédiat) + sélecteur de dimension (temp/pluie/vent, immédiat) + champ
// **heure de départ** (texte « AAAA-MM-JJ HH:MM », parité planning `SidebarWeatherSection`
// — pas de picker natif). L'heure de départ est persistée **à la fermeture** (comme
// rayon/vitesse, 16-25) ; les toggles météo écrivent le store immédiatement.

const ANIM_MS = 250;
const SWIPE_CLOSE_THRESHOLD = 80;
const RADIUS_STEP = 0.5;
const RADIUS_MIN = 0.5;
const SPEED_STEP = 1;
const SPEED_MIN = 5;
const SPEED_MAX = 50;
const SHEET_OFFSCREEN = 1000;

const WEATHER_DIMENSIONS: { id: WeatherDimension; icon: LucideIcon; key: string }[] = [
  { id: 'temperature', icon: ThermometerIcon, key: 'temperature' },
  { id: 'precipitation', icon: UmbrellaIcon, key: 'precipitation' },
  { id: 'wind', icon: WindIcon, key: 'wind' },
];

export interface LiveFiltersDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** POIs hébergement (compteurs des sous-types, `onlyCountActive` en live). */
  accommodationPois?: Poi[];
}

function Stepper({
  value,
  unit,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  atMin,
  atMax,
  testID,
}: {
  value: string;
  unit: string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  atMin: boolean;
  atMax: boolean;
  testID: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        testID={`${testID}-minus`}
        accessibilityRole="button"
        accessibilityLabel={decrementLabel}
        disabled={atMin}
        onPress={onDecrement}
        className={
          atMin
            ? 'h-9 w-9 items-center justify-center rounded-lg border border-border opacity-50'
            : 'h-9 w-9 items-center justify-center rounded-lg border border-border active:bg-muted'
        }
      >
        <MinusIcon size={16} className="text-text-primary" />
      </Pressable>
      <Text
        testID={`${testID}-value`}
        className="min-w-[5rem] text-center font-montserrat-bold text-lg text-text-primary"
      >
        {`${value} ${unit}`}
      </Text>
      <Pressable
        testID={`${testID}-plus`}
        accessibilityRole="button"
        accessibilityLabel={incrementLabel}
        disabled={atMax}
        onPress={onIncrement}
        className={
          atMax
            ? 'h-9 w-9 items-center justify-center rounded-lg border border-border opacity-50'
            : 'h-9 w-9 items-center justify-center rounded-lg border border-border active:bg-muted'
        }
      >
        <PlusIcon size={16} className="text-text-primary" />
      </Pressable>
    </View>
  );
}

export function LiveFiltersDrawer({
  open,
  onOpenChange,
  accommodationPois,
}: LiveFiltersDrawerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm);
  const speedKmh = useLiveStore((s) => s.speedKmh);
  const setSearchRadius = useLiveStore((s) => s.setSearchRadius);
  const setSpeedKmh = useLiveStore((s) => s.setSpeedKmh);
  const weatherDepartureTime = useLiveStore((s) => s.weatherDepartureTime);
  const setWeatherDepartureTime = useLiveStore((s) => s.setWeatherDepartureTime);
  const visibleLayers = useMapStore((s) => s.visibleLayers);
  // Météo (store carte) — toggles immédiats (overlay partagé avec le planning).
  const weatherActive = useMapStore((s) => s.weatherActive);
  const setWeatherActive = useMapStore((s) => s.setWeatherActive);
  const weatherDimension = useMapStore((s) => s.weatherDimension);
  const setWeatherDimension = useMapStore((s) => s.setWeatherDimension);

  // État local — rayon + vitesse + heure de départ requièrent une persistance à la
  // fermeture (16-25). Les toggles calques/sous-types/météo restent immédiats.
  const [localRadius, setLocalRadius] = useState(Number(searchRadiusKm.toFixed(1)));
  const [localSpeed, setLocalSpeed] = useState(speedKmh);
  const [localDeparture, setLocalDeparture] = useState(weatherDepartureTime ?? '');

  const [sheetHeight, setSheetHeight] = useState(0);
  const [translateY] = useState(() => new Animated.Value(SHEET_OFFSCREEN));

  // Ré-init de l'état local à chaque ouverture — pattern « ajuster l'état au rendu »
  // (React docs) plutôt qu'un effet (évite `set-state-in-effect`). On lit le store via
  // getState (pas d'abonnement) pour ne pas re-déclencher au commit.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const s = useLiveStore.getState();
      setLocalRadius(s.searchRadiusKm);
      setLocalSpeed(s.speedKmh);
      setLocalDeparture(s.weatherDepartureTime ?? '');
    }
  }

  // Animation ouverture/fermeture (translateY). Fermé → glissé sous l'écran (`sheetHeight`).
  useEffect(() => {
    if (open) {
      Animated.timing(translateY, {
        toValue: 0,
        duration: ANIM_MS,
        useNativeDriver: true,
      }).start();
    } else if (sheetHeight > 0) {
      Animated.timing(translateY, {
        toValue: sheetHeight,
        duration: ANIM_MS,
        useNativeDriver: true,
      }).start();
    }
  }, [open, sheetHeight, translateY]);

  // Fermeture (✕ / overlay / swipe) → commit local au store PUIS fermeture (16-25).
  const handleClose = useCallback(() => {
    setSearchRadius(localRadius);
    setSpeedKmh(localSpeed);
    setWeatherDepartureTime(localDeparture.trim() || null);
    onOpenChange(false);
  }, [
    localRadius,
    localSpeed,
    localDeparture,
    setSearchRadius,
    setSpeedKmh,
    setWeatherDepartureTime,
    onOpenChange,
  ]);

  const handleCloseRef = useRef(handleClose);
  useEffect(() => { handleCloseRef.current = handleClose; });

  // Swipe vers le bas sur la poignée → fermeture (suivi du doigt, snap-back sinon).
  const responder = useMemo(
    () =>
      // `react-hooks/refs` faux positif : `handleCloseRef.current` n'est lu QUE dans le
      // handler de geste (jamais en rendu) ; la ref sert justement à mémoïser le responder
      // sur [translateY] sans le recréer quand `handleClose` change.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 4,
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > SWIPE_CLOSE_THRESHOLD) {
            handleCloseRef.current();
          } else {
            Animated.timing(translateY, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [translateY],
  );

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== sheetHeight) setSheetHeight(h);
  };

  const showAccommodationSubTypes = visibleLayers.has('accommodations');

  return (
    <View
      pointerEvents={open ? 'box-none' : 'none'}
      className="absolute inset-0 z-40"
    >
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('live.filters.close')}
          onPress={handleClose}
          className="absolute inset-0 bg-black/40"
        />
      ) : null}

      <Animated.View
        onLayout={onSheetLayout}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom + 16,
          transform: [{ translateY }],
        }}
        className="rounded-t-2xl border-t border-border bg-background-page"
      >
        {/* Poignée de glissement (drag-to-dismiss). */}
        <View {...responder.panHandlers} className="items-center pb-2 pt-3">
          <View className="h-1.5 w-12 rounded-full bg-muted" />
        </View>

        {/* En-tête : titre + ✕ */}
        <View className="flex-row items-center justify-between px-4 pb-3">
          <Text className="text-base font-montserrat-semibold text-text-primary">
            {t('live.filters.title')}
          </Text>
          <Pressable
            testID="filters-close-btn"
            accessibilityRole="button"
            accessibilityLabel={t('live.filters.close')}
            onPress={handleClose}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
          >
            <XIcon size={18} className="text-text-primary" />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 20 }}
          style={{ maxHeight: 420 }}
        >
          {/* Vitesse moyenne (persist à la fermeture) */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-montserrat-semibold text-text-primary">
              {t('live.search.speedLabel')}
            </Text>
            <Stepper
              testID="filter-speed"
              value={String(localSpeed)}
              unit={t('map.avgSpeed.unit')}
              atMin={localSpeed <= SPEED_MIN}
              atMax={localSpeed >= SPEED_MAX}
              decrementLabel={t('live.search.speedDecrement')}
              incrementLabel={t('live.search.speedIncrement')}
              onDecrement={() =>
                setLocalSpeed((v) => Math.max(SPEED_MIN, v - SPEED_STEP))
              }
              onIncrement={() =>
                setLocalSpeed((v) => Math.min(SPEED_MAX, v + SPEED_STEP))
              }
            />
          </View>

          {/* Distance de la trace = rayon (persist à la fermeture) */}
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-montserrat-semibold text-text-primary">
              {t('live.search.radiusLabel')}
            </Text>
            <Stepper
              testID="filter-radius"
              value={String(localRadius)}
              unit={t('live.search.radiusUnit')}
              atMin={localRadius <= RADIUS_MIN}
              atMax={localRadius >= MAX_LIVE_RADIUS_KM}
              decrementLabel={t('live.search.radiusDecrement')}
              incrementLabel={t('live.search.radiusIncrement')}
              onDecrement={() =>
                setLocalRadius((r) =>
                  Math.max(RADIUS_MIN, Math.round((r - RADIUS_STEP) * 10) / 10),
                )
              }
              onIncrement={() =>
                setLocalRadius((r) =>
                  Math.min(
                    MAX_LIVE_RADIUS_KM,
                    Math.round((r + RADIUS_STEP) * 10) / 10,
                  ),
                )
              }
            />
          </View>

          {/* Calques POI (toggles immédiats) */}
          <View>
            <Text className="mb-2 text-sm font-montserrat-semibold text-text-primary">
              {t('live.search.layersLabel')}
            </Text>
            <PoiLayerGrid isPending={false} />
          </View>

          {/* Sous-types hébergement (immédiat, badge des seuls types actifs en live) */}
          {showAccommodationSubTypes ? (
            <AccommodationSubTypes
              accommodationPois={accommodationPois}
              onlyCountActive
            />
          ) : null}

          {/* Météo (MOB-5.6) — toggle + dimension immédiats, heure de départ à la fermeture */}
          <View className="gap-3 border-t border-border pt-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-montserrat-semibold text-text-primary">
                {t('live.weather.showOnMap')}
              </Text>
              <Switch
                checked={weatherActive}
                onCheckedChange={setWeatherActive}
                accessibilityLabel={t('live.weather.showOnMap')}
                testID="weather-toggle"
              />
            </View>

            {/* Sélecteur de dimension (temp/pluie/vent) */}
            <View className="flex-row gap-1 rounded-full bg-muted p-1">
              {WEATHER_DIMENSIONS.map(({ id, icon: Icon, key }) => {
                const active = weatherDimension === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`map.weather.${key}`)}
                    testID={`weather-dim-${id}`}
                    onPress={() => setWeatherDimension(id)}
                    className={
                      active
                        ? 'flex-1 flex-row items-center justify-center gap-1 rounded-full bg-background py-1.5'
                        : 'flex-1 flex-row items-center justify-center gap-1 rounded-full py-1.5'
                    }
                  >
                    <Icon
                      size={14}
                      className={active ? 'text-primary' : 'text-text-muted'}
                    />
                    <Text
                      className={
                        active
                          ? 'text-xs font-montserrat-medium text-primary'
                          : 'text-xs font-montserrat text-text-muted'
                      }
                    >
                      {t(`map.weather.${key}Short`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Heure de départ (texte) — override du pace-adjusted, persistée à la fermeture */}
            <View className="gap-1.5">
              <Text className="text-xs font-montserrat text-text-muted">
                {t('live.weather.departureLabel')}
              </Text>
              <TextInput
                testID="input-departure-time"
                value={localDeparture}
                onChangeText={setLocalDeparture}
                placeholder={t('common.dateTimePlaceholder')}
                autoCapitalize="none"
                accessibilityLabel={t('live.weather.departureLabel')}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-montserrat text-text-primary"
              />
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
