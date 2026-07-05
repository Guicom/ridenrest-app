import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/card';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloudRainIcon,
  ThermometerIcon,
  UmbrellaIcon,
  WindIcon,
  type LucideIcon,
} from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import {
  useMapStore,
  type WeatherDimension,
} from '@/lib/stores/map.store';
import { useTranslation } from '@/lib/i18n';

// Carte « Météo » (mode planning) — port iso de `sidebar-weather-section.tsx` +
// `weather-controls.tsx` web. Toggle « Afficher sur la carte » (store `weatherActive`),
// sélecteur de dimension (temp/pluie/vent → `weatherDimension`), heure de départ (texte,
// pas de picker natif → zéro nouveau module). Pas de liste par waypoint (overlay carte).

const DIMENSIONS: { id: WeatherDimension; icon: LucideIcon; key: string }[] = [
  { id: 'temperature', icon: ThermometerIcon, key: 'temperature' },
  { id: 'precipitation', icon: UmbrellaIcon, key: 'precipitation' },
  { id: 'wind', icon: WindIcon, key: 'wind' },
];

export interface SidebarWeatherSectionProps {
  departureTime: string;
  onDepartureChange: (value: string) => void;
  stagesHaveDepartures: boolean;
}

export function SidebarWeatherSection({
  departureTime,
  onDepartureChange,
  stagesHaveDepartures,
}: SidebarWeatherSectionProps) {
  const { t } = useTranslation();
  // Replié par défaut (seul « Recherche » est ouvert au départ).
  const [expanded, setExpanded] = useState(false);
  const weatherActive = useMapStore((s) => s.weatherActive);
  const setWeatherActive = useMapStore((s) => s.setWeatherActive);
  const weatherDimension = useMapStore((s) => s.weatherDimension);
  const setWeatherDimension = useMapStore((s) => s.setWeatherDimension);

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID="weather-section-header"
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center justify-between"
      >
        <View className="flex-row items-center gap-2">
          <CloudRainIcon size={16} className="text-text-primary" />
          <Text className="text-sm font-montserrat-medium text-text-primary">
            {t('map.weather.title')}
          </Text>
        </View>
        {expanded ? (
          <ChevronUpIcon size={16} className="text-text-muted" />
        ) : (
          <ChevronDownIcon size={16} className="text-text-muted" />
        )}
      </Pressable>

      {expanded ? (
        <View className="mt-3 gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-montserrat text-text-muted">
              {t('map.showOnMap')}
            </Text>
            <Switch
              checked={weatherActive}
              onCheckedChange={setWeatherActive}
              accessibilityLabel={t('map.showOnMap')}
              testID="weather-toggle"
            />
          </View>

          {/* Sélecteur de dimension */}
          <View className="flex-row gap-1 rounded-full bg-muted p-1">
            {DIMENSIONS.map(({ id, icon: Icon, key }) => {
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

          {/* Heure de départ */}
          {stagesHaveDepartures ? (
            <View className="rounded-xl bg-muted px-3 py-2.5">
              <Text className="text-sm font-montserrat text-text-muted">
                {t('map.weather.byStage')}
              </Text>
            </View>
          ) : (
            <View className="gap-1.5">
              <Text className="text-xs font-montserrat text-text-muted">
                {t('map.weather.departure')}
              </Text>
              <TextInput
                value={departureTime}
                onChangeText={onDepartureChange}
                placeholder={t('common.dateTimePlaceholder')}
                autoCapitalize="none"
                accessibilityLabel={t('map.weather.departure')}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-montserrat text-text-primary"
              />
            </View>
          )}
        </View>
      ) : null}
    </Card>
  );
}
