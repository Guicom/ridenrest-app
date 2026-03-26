import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LiveWeatherOverlay } from './live-weather-overlay'

afterEach(cleanup)

describe('LiveWeatherOverlay', () => {
  const defaultProps = {
    weatherActive: true,
    onToggle: vi.fn(),
    dimension: 'temperature' as const,
    onDimensionChange: vi.fn(),
    isGpsLost: false,
    departureTime: '',
    onDepartureTimeChange: vi.fn(),
  }

  it('renders toggle button', () => {
    render(<LiveWeatherOverlay {...defaultProps} />)
    expect(screen.getByTestId('weather-toggle')).toHaveTextContent('Météo')
  })

  it('shows controls panel when active', () => {
    render(<LiveWeatherOverlay {...defaultProps} weatherActive={true} />)
    expect(screen.getByTestId('weather-controls-panel')).toBeInTheDocument()
  })

  it('hides controls panel when inactive', () => {
    render(<LiveWeatherOverlay {...defaultProps} weatherActive={false} />)
    expect(screen.queryByTestId('weather-controls-panel')).toBeNull()
  })

  it('calls onToggle when toggle button clicked', () => {
    const onToggle = vi.fn()
    render(<LiveWeatherOverlay {...defaultProps} onToggle={onToggle} />)
    fireEvent.click(screen.getByTestId('weather-toggle'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('renders dimension buttons and calls onDimensionChange', () => {
    const onDimensionChange = vi.fn()
    render(<LiveWeatherOverlay {...defaultProps} onDimensionChange={onDimensionChange} />)

    expect(screen.getByTestId('weather-dim-temperature')).toBeInTheDocument()
    expect(screen.getByTestId('weather-dim-precipitation')).toBeInTheDocument()
    expect(screen.getByTestId('weather-dim-wind')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('weather-dim-wind'))
    expect(onDimensionChange).toHaveBeenCalledWith('wind')
  })

  it('highlights active dimension', () => {
    render(<LiveWeatherOverlay {...defaultProps} dimension="precipitation" />)
    const precip = screen.getByTestId('weather-dim-precipitation')
    expect(precip.getAttribute('aria-pressed')).toBe('true')
  })

  it('shows GPS lost banner when isGpsLost is true', () => {
    render(<LiveWeatherOverlay {...defaultProps} isGpsLost={true} />)
    expect(screen.getByTestId('gps-lost-banner')).toHaveTextContent('Position GPS indisponible')
  })

  it('hides GPS lost banner when isGpsLost is false', () => {
    render(<LiveWeatherOverlay {...defaultProps} isGpsLost={false} />)
    expect(screen.queryByTestId('gps-lost-banner')).toBeNull()
  })

  it('renders departure time input and calls onDepartureTimeChange', () => {
    const onChange = vi.fn()
    render(<LiveWeatherOverlay {...defaultProps} onDepartureTimeChange={onChange} />)

    const input = screen.getByTestId('weather-departure-time')
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '2026-03-19T08:00' } })
    expect(onChange).toHaveBeenCalledWith('2026-03-19T08:00')
  })
})
