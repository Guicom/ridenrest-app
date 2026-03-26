import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LiveWeatherPanel } from './live-weather-panel'
import type { WeatherPoint } from '@ridenrest/shared'

const NOW = new Date('2026-03-19T12:00:00Z')

function makeWeatherPoint(overrides: Partial<WeatherPoint> = {}): WeatherPoint {
  return {
    km: 100,
    forecastAt: new Date(NOW.getTime() + 80 * 60000).toISOString(), // +80min
    temperatureC: 14,
    precipitationProbability: 10,
    windSpeedKmh: 12,
    windDirection: 180,
    weatherCode: 2,
    iconEmoji: '⛅',
    ...overrides,
  }
}

describe('LiveWeatherPanel', () => {
  beforeAll(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW.getTime())
  })

  afterEach(() => {
    cleanup()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('renders weather cards', () => {
    const points = [
      makeWeatherPoint({ km: 100 }),
      makeWeatherPoint({ km: 105 }),
      makeWeatherPoint({ km: 110 }),
    ]

    render(
      <LiveWeatherPanel
        weatherPoints={points}
        isPending={false}
        isError={false}
        isGpsLost={false}
      />,
    )

    const cards = screen.getAllByTestId('weather-card')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveTextContent('14°C')
    expect(cards[0]).toHaveTextContent('12 km/h')
    expect(cards[0]).toHaveTextContent('10%')
    expect(cards[0]).toHaveTextContent('km 100')
  })

  it('shows skeleton loading state when pending and no data', () => {
    render(
      <LiveWeatherPanel
        weatherPoints={[]}
        isPending={true}
        isError={false}
        isGpsLost={false}
      />,
    )

    expect(screen.getByTestId('weather-skeleton')).toBeInTheDocument()
  })

  it('shows GPS lost banner with cards still visible', () => {
    const points = [makeWeatherPoint({ km: 100 }), makeWeatherPoint({ km: 105 })]

    render(
      <LiveWeatherPanel
        weatherPoints={points}
        isPending={false}
        isError={false}
        isGpsLost={true}
      />,
    )

    expect(screen.getByTestId('gps-lost-banner')).toHaveTextContent('Position GPS indisponible')
    // Cards still visible
    expect(screen.getAllByTestId('weather-card')).toHaveLength(2)
  })

  it('shows error state when error and no data', () => {
    render(
      <LiveWeatherPanel
        weatherPoints={[]}
        isPending={false}
        isError={true}
        isGpsLost={false}
      />,
    )

    expect(screen.getByTestId('weather-error')).toHaveTextContent('Météo non disponible')
  })

  it('keeps previous data visible on error (AC #8)', () => {
    const points = [makeWeatherPoint()]
    render(
      <LiveWeatherPanel
        weatherPoints={points}
        isPending={false}
        isError={true}
        isGpsLost={false}
      />,
    )

    // Error state not shown when data exists
    expect(screen.queryByTestId('weather-error')).not.toBeInTheDocument()
    // Cards still visible
    expect(screen.getAllByTestId('weather-card')).toHaveLength(1)
  })

  it('limits display to 5 cards max', () => {
    const points = Array.from({ length: 8 }, (_, i) =>
      makeWeatherPoint({ km: 100 + i * 5 }),
    )

    render(
      <LiveWeatherPanel
        weatherPoints={points}
        isPending={false}
        isError={false}
        isGpsLost={false}
      />,
    )

    expect(screen.getAllByTestId('weather-card')).toHaveLength(5)
  })

  it('formats ETA as relative time', () => {
    const points = [
      makeWeatherPoint({
        forecastAt: new Date(NOW.getTime() + 80 * 60000).toISOString(), // +1h20
      }),
    ]

    render(
      <LiveWeatherPanel
        weatherPoints={points}
        isPending={false}
        isError={false}
        isGpsLost={false}
      />,
    )

    expect(screen.getAllByTestId('weather-card')[0]).toHaveTextContent('dans ~1h20')
  })
})
