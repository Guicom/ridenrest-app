import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SidebarWeatherSection } from './sidebar-weather-section'

afterEach(cleanup)

const mockSetWeatherActive = vi.fn()
const mockSetWeatherDimension = vi.fn()

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    weatherActive: false,
    weatherDimension: 'temperature',
    setWeatherActive: mockSetWeatherActive,
    setWeatherDimension: mockSetWeatherDimension,
  }),
}))

vi.mock('./weather-controls', () => ({
  WeatherControls: () => <div data-testid="weather-controls" />,
  WEATHER_PACE_STORAGE_KEY: 'ridenrest:weather-pace',
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, 'aria-label': ariaLabel, 'data-testid': testId }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; 'aria-label'?: string; 'data-testid'?: string }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}))

describe('SidebarWeatherSection', () => {
  afterEach(() => {
    mockSetWeatherActive.mockClear()
    mockSetWeatherDimension.mockClear()
  })

  it('renders section header with Météo label', () => {
    render(<SidebarWeatherSection isPending={false} onPaceSubmit={vi.fn()} />)
    expect(screen.getByText('Météo')).toBeDefined()
  })

  it('renders toggle switch', () => {
    render(<SidebarWeatherSection isPending={false} onPaceSubmit={vi.fn()} />)
    expect(screen.getByTestId('weather-toggle')).toBeDefined()
  })

  it('WeatherControls IS rendered by default (expanded by default)', () => {
    render(<SidebarWeatherSection isPending={false} onPaceSubmit={vi.fn()} />)
    expect(screen.getByTestId('weather-controls')).toBeDefined()
  })

  it('clicking header collapses WeatherControls', () => {
    render(<SidebarWeatherSection isPending={false} onPaceSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('weather-section-header'))
    expect(screen.queryByTestId('weather-controls')).toBeNull()
  })

  it('switch is visible inside the expanded body', () => {
    render(<SidebarWeatherSection isPending={false} onPaceSubmit={vi.fn()} />)
    expect(screen.getByTestId('weather-toggle')).toBeDefined()
  })

  it('switch is NOT visible when collapsed', () => {
    render(<SidebarWeatherSection isPending={false} onPaceSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('weather-section-header'))
    expect(screen.queryByTestId('weather-toggle')).toBeNull()
  })

  it('clicking toggle calls setWeatherActive', () => {
    render(<SidebarWeatherSection isPending={false} onPaceSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('weather-toggle'))
    expect(mockSetWeatherActive).toHaveBeenCalledWith(true)
  })
})
