import type { WeatherPoint } from '@ridenrest/shared';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';

// Strip météo Live (MOB-5.6 / AC4) — port de `LiveWeatherPanel` web en RN/NativeWind.
// Bande horizontale de cartes (5 max) : icône WMO + ETA relative, température, vent,
// précipitations, km. Points `null` (au-delà de l'horizon Open-Meteo) → « indisponible »
// grisé (jamais d'erreur). Erreur météo **inline** ici (« Météo non disponible »), JAMAIS
// dans la bannière de statut globale (réservée aux POI, AC5). GPS perdu → bandeau ambre.
//
// Le rendu de l'overlay carte (ligne colorée + flèches de vent proportionnelles) est
// assuré séparément par `WeatherLayer` ; ce strip est le résumé textuel du panneau Live.

export interface LiveWeatherStripProps {
  weatherPoints: WeatherPoint[];
  isPending: boolean;
  isError: boolean;
  isGpsLost: boolean;
}

/** ISO ETA → « maintenant » / « dans ~Xh MM » / « dans ~Mmin » (i18n FR/EN). */
function useRelativeEta(): (forecastAt: string) => string {
  const { t } = useTranslation();
  return useCallback(
    (forecastAt: string) => {
      const diffMs = new Date(forecastAt).getTime() - Date.now();
      if (diffMs <= 0) return t('live.weather.now');
      const totalMinutes = Math.round(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours > 0
        ? t('live.weather.inHours', {
            hours,
            minutes: String(minutes).padStart(2, '0'),
          })
        : t('live.weather.inMinutes', { minutes });
    },
    [t],
  );
}

export function LiveWeatherStrip({
  weatherPoints,
  isPending,
  isError,
  isGpsLost,
}: LiveWeatherStripProps) {
  const { t } = useTranslation();
  const formatRelativeEta = useRelativeEta();

  const hasData = weatherPoints.length > 0;
  const showSkeleton = isPending && !hasData;
  const showError = isError && !hasData;
  const unavailable = t('live.weather.unavailable');

  return (
    <View testID="live-weather-strip" className="mt-3 gap-1">
      {isGpsLost ? (
        <Text
          testID="gps-lost-banner"
          accessibilityRole="alert"
          className="text-xs font-montserrat text-amber-500"
        >
          {t('live.weather.gpsLost')}
        </Text>
      ) : null}

      {showError ? (
        <Text
          testID="weather-error"
          accessibilityRole="alert"
          className="text-xs font-montserrat text-text-muted"
        >
          {t('live.weather.error')}
        </Text>
      ) : null}

      {showSkeleton ? (
        <View testID="weather-skeleton" className="flex-row gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-24 rounded-lg" />
          ))}
        </View>
      ) : null}

      {!showSkeleton && !showError && hasData ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        >
          {weatherPoints.slice(0, 5).map((wp) => {
            const temp = wp.temperatureC !== null ? `${wp.temperatureC}°C` : '—';
            const wind = wp.windSpeedKmh ?? '—';
            const precip = wp.precipitationProbability ?? '—';
            const isAvailable = wp.temperatureC !== null;
            const a11y = isAvailable
              ? t('live.weather.cardA11y', {
                  eta: formatRelativeEta(wp.forecastAt),
                  temp,
                  wind,
                  precip,
                })
              : `${formatRelativeEta(wp.forecastAt)}, ${unavailable}`;
            return (
              <View
                key={wp.km}
                testID="weather-card"
                accessible
                accessibilityLabel={a11y}
                className={
                  isAvailable
                    ? 'w-24 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background p-2'
                    : 'w-24 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted p-2 opacity-60'
                }
              >
                <Text className="text-xs font-montserrat-medium text-text-primary">
                  {`${wp.iconEmoji ?? '—'} ${formatRelativeEta(wp.forecastAt)}`}
                </Text>
                {isAvailable ? (
                  <>
                    <Text className="text-sm font-montserrat-semibold text-text-primary">
                      {temp}
                    </Text>
                    <Text className="text-xs font-montserrat text-text-secondary">
                      {`💨 ${wind} km/h`}
                    </Text>
                    <Text className="text-xs font-montserrat text-text-secondary">
                      {`🌧 ${precip}%`}
                    </Text>
                  </>
                ) : (
                  <Text className="text-xs font-montserrat text-text-muted">
                    {unavailable}
                  </Text>
                )}
                <Text className="text-[10px] font-montserrat text-text-muted">
                  {`km ${Math.round(wp.km)}`}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
