import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { WeatherControls } from './weather-controls'

describe('WeatherControls', () => {
  afterEach(() => cleanup())

  const defaultProps = {
    isPending: false,
    onPaceSubmit: vi.fn(),
    dimension: 'temperature' as const,
    onDimensionChange: vi.fn(),
  }

  it('renders dimension buttons', () => {
    render(<WeatherControls {...defaultProps} />)
    expect(screen.getByTestId('weather-dim-temperature')).toBeDefined()
    expect(screen.getByTestId('weather-dim-precipitation')).toBeDefined()
    expect(screen.getByTestId('weather-dim-wind')).toBeDefined()
  })

  it('calls onDimensionChange when a dimension button is clicked', () => {
    const onDimensionChange = vi.fn()
    render(<WeatherControls {...defaultProps} onDimensionChange={onDimensionChange} />)

    fireEvent.click(screen.getByTestId('weather-dim-precipitation'))
    expect(onDimensionChange).toHaveBeenCalledWith('precipitation')
  })

  it('marks the active dimension button with aria-pressed=true', () => {
    render(<WeatherControls {...defaultProps} dimension="wind" />)
    expect(screen.getByTestId('weather-dim-wind').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('weather-dim-temperature').getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onPaceSubmit with null when form submitted without values', () => {
    const onPaceSubmit = vi.fn()
    render(<WeatherControls {...defaultProps} onPaceSubmit={onPaceSubmit} />)

    fireEvent.click(screen.getByTestId('weather-submit'))
    expect(onPaceSubmit).toHaveBeenCalledWith(null, null)
  })

  it('calls onPaceSubmit with speed when speed is entered', () => {
    const onPaceSubmit = vi.fn()
    render(<WeatherControls {...defaultProps} onPaceSubmit={onPaceSubmit} />)

    const speedInput = screen.getByLabelText('Vitesse (km/h)')
    fireEvent.change(speedInput, { target: { value: '20' } })
    fireEvent.click(screen.getByTestId('weather-submit'))

    expect(onPaceSubmit).toHaveBeenCalledWith(null, 20)
  })

  it('shows loading skeleton when isPending', () => {
    const { container } = render(<WeatherControls {...defaultProps} isPending={true} />)
    // Skeleton element should be present
    const skeleton = container.querySelector('.h-2')
    expect(skeleton).toBeTruthy()
  })

  it('disables submit button while pending', () => {
    render(<WeatherControls {...defaultProps} isPending={true} />)
    const submitButton = screen.getByTestId('weather-submit') as HTMLButtonElement
    expect(submitButton.disabled).toBe(true)
  })
})
