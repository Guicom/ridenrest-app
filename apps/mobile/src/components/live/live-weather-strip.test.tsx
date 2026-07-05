import { render } from '@testing-library/react-native';
import type { WeatherPoint } from '@ridenrest/shared';

import { LiveWeatherStrip } from '@/components/live/live-weather-strip';
import { i18n } from '@/lib/i18n';

// LiveWeatherStrip (MOB-5.6 / T6) — résumé météo du panneau Live. On vérifie : cartes
// (icône WMO + ETA relative), point `null` → « indisponible », skeleton (pending sans
// data), erreur inline (« Météo non disponible »), bandeau GPS perdu, ETA relative.

const NOW = new Date('2026-06-15T10:00:00.000Z').getTime();

function point(overrides: Partial<WeatherPoint> = {}): WeatherPoint {
  return {
    km: 10,
    forecastAt: new Date(NOW + 80 * 60_000).toISOString(), // +1 h 20
    temperatureC: 18,
    precipitationProbability: 10,
    windSpeedKmh: 20,
    windDirection: 90,
    weatherCode: 0,
    iconEmoji: '☀️',
    ...overrides,
  };
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
});

describe('LiveWeatherStrip (AC4)', () => {
  it('rend une carte par point (max 5) avec l’icône WMO', async () => {
    const { getAllByTestId, getAllByText } = await render(
      <LiveWeatherStrip
        weatherPoints={[point(), point({ km: 15 })]}
        isPending={false}
        isError={false}
        isGpsLost={false}
      />,
    );
    expect(getAllByTestId('weather-card')).toHaveLength(2);
    // Icône WMO présente sur chaque carte.
    expect(getAllByText(/☀️/)).toHaveLength(2);
  });

  it('ETA relative « dans ~1h20 » (i18n)', async () => {
    const { getByText } = await render(
      <LiveWeatherStrip
        weatherPoints={[point()]}
        isPending={false}
        isError={false}
        isGpsLost={false}
      />,
    );
    const eta = i18n.t('live.weather.inHours', { hours: 1, minutes: '20' });
    expect(getByText(new RegExp(eta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
  });

  it('point null → « indisponible » grisé (pas d’erreur)', async () => {
    const { getByText, queryByTestId } = await render(
      <LiveWeatherStrip
        weatherPoints={[
          point({ temperatureC: null, windSpeedKmh: null, precipitationProbability: null, iconEmoji: null }),
        ]}
        isPending={false}
        isError={false}
        isGpsLost={false}
      />,
    );
    expect(getByText(i18n.t('live.weather.unavailable'))).toBeTruthy();
    expect(queryByTestId('weather-error')).toBeNull();
  });

  it('skeleton quand pending sans données', async () => {
    const { getByTestId, queryByTestId } = await render(
      <LiveWeatherStrip weatherPoints={[]} isPending isError={false} isGpsLost={false} />,
    );
    expect(getByTestId('weather-skeleton')).toBeTruthy();
    expect(queryByTestId('weather-card')).toBeNull();
  });

  it('erreur inline (« Météo non disponible ») sans données', async () => {
    const { getByText, getByTestId } = await render(
      <LiveWeatherStrip weatherPoints={[]} isPending={false} isError isGpsLost={false} />,
    );
    expect(getByTestId('weather-error')).toBeTruthy();
    expect(getByText(i18n.t('live.weather.error'))).toBeTruthy();
  });

  it('erreur masquée si des données sont déjà affichées (cache)', async () => {
    const { queryByTestId, getAllByTestId } = await render(
      <LiveWeatherStrip weatherPoints={[point()]} isPending={false} isError isGpsLost={false} />,
    );
    expect(queryByTestId('weather-error')).toBeNull();
    expect(getAllByTestId('weather-card')).toHaveLength(1);
  });

  it('bandeau GPS perdu', async () => {
    const { getByTestId, getByText } = await render(
      <LiveWeatherStrip weatherPoints={[]} isPending={false} isError={false} isGpsLost />,
    );
    expect(getByTestId('gps-lost-banner')).toBeTruthy();
    expect(getByText(i18n.t('live.weather.gpsLost'))).toBeTruthy();
  });
});
