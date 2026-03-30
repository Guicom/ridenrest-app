import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageWeatherBadge } from './stage-weather-badge'

const mockUseStageWeather = vi.fn()

vi.mock('@/hooks/use-stage-weather', () => ({
  useStageWeather: (...args: unknown[]) => mockUseStageWeather(...args),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

describe('StageWeatherBadge', () => {
  beforeEach(() => {
    mockUseStageWeather.mockReset()
  })

  it('shows skeleton while loading', () => {
    mockUseStageWeather.mockReturnValue({ data: null, isPending: true, isError: false })

    render(<StageWeatherBadge stageId="stage-1" departureTime={undefined} speedKmh={undefined} />)

    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })

  it('shows formatted weather text when loaded', () => {
    mockUseStageWeather.mockReturnValue({
      data: {
        forecastAt: '2026-03-22T12:00:00.000Z',
        temperatureC: 14,
        precipitationMmH: 0,
        windSpeedKmh: 12,
        windDirectionDeg: 270,
        iconEmoji: '⛅',
      },
      isPending: false,
      isError: false,
    })

    render(<StageWeatherBadge stageId="stage-1" departureTime={undefined} speedKmh={undefined} />)

    const badge = screen.getByText(/14°/)
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toContain('12 km/h')
    expect(badge.textContent).toContain('⛅')
  })

  it('shows precipitation icon when precipitationMmH > 0.5', () => {
    mockUseStageWeather.mockReturnValue({
      data: {
        forecastAt: '2026-03-22T12:00:00.000Z',
        temperatureC: 10,
        precipitationMmH: 1.5,
        windSpeedKmh: 8,
        windDirectionDeg: 90,
        iconEmoji: '🌧',
      },
      isPending: false,
      isError: false,
    })

    render(<StageWeatherBadge stageId="stage-1" departureTime={undefined} speedKmh={undefined} />)

    const badge = screen.getByText(/10°/)
    expect(badge.textContent).toContain('🌧')
  })

  it('does not show precipitation icon when precipitationMmH <= 0.5', () => {
    mockUseStageWeather.mockReturnValue({
      data: {
        forecastAt: '2026-03-22T12:00:00.000Z',
        temperatureC: 18,
        precipitationMmH: 0.3,
        windSpeedKmh: 5,
        windDirectionDeg: 180,
        iconEmoji: '☀️',
      },
      isPending: false,
      isError: false,
    })

    render(<StageWeatherBadge stageId="stage-1" departureTime={undefined} speedKmh={undefined} />)

    const badge = screen.getByText(/18°/)
    // Should not contain the rain emoji (separate from iconEmoji)
    expect(badge.textContent).not.toContain(' 🌧')
  })

  it('renders nothing on error', () => {
    mockUseStageWeather.mockReturnValue({ data: null, isPending: false, isError: true })

    const { container } = render(
      <StageWeatherBadge stageId="stage-1" departureTime={undefined} speedKmh={undefined} />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when data is null (no waypoints)', () => {
    mockUseStageWeather.mockReturnValue({ data: null, isPending: false, isError: false })

    const { container } = render(
      <StageWeatherBadge stageId="stage-1" departureTime={undefined} speedKmh={undefined} />,
    )

    expect(container.firstChild).toBeNull()
  })
})
