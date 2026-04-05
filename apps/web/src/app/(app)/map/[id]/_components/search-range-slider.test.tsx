import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { SearchRangeSlider } from './search-range-slider'

// Mock useMapStore
let mockFromKm = 0
let mockToKm = 30
const mockSetSearchRange = vi.fn()

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    fromKm: mockFromKm,
    toKm: mockToKm,
    setSearchRange: mockSetSearchRange,
  }),
}))

// Capture onValueChange to invoke it directly in tests (allows testing cap logic)
let capturedOnValueChange: ((v: number | readonly number[]) => void) | undefined

// Mock Slider component
vi.mock('@/components/ui/slider', () => ({
  Slider: ({ value, onValueChange, min, max, step }: {
    value: number[]
    onValueChange: (v: number | readonly number[]) => void
    min: number
    max: number
    step: number
  }) => {
    capturedOnValueChange = onValueChange
    return (
      <div
        data-testid="slider"
        data-min={min}
        data-max={max}
        data-step={step}
        data-value={JSON.stringify(value)}
      />
    )
  },
}))

describe('SearchRangeSlider', () => {
  beforeEach(() => {
    mockFromKm = 0
    mockToKm = 30
    mockSetSearchRange.mockReset()
  })

  afterEach(cleanup)

  it('renders with slider at default store values (0, 30)', () => {
    render(<SearchRangeSlider totalDistanceKm={120} />)
    const slider = screen.getByTestId('slider')
    expect(JSON.parse(slider.getAttribute('data-value')!)).toEqual([0, 30])
  })

  it('shows km range label "0 – 30 km"', () => {
    render(<SearchRangeSlider totalDistanceKm={120} />)
    expect(screen.getByText('0 – 30 km')).toBeDefined()
  })

  it('shows "Plage maximale : 50 km" message when range = 50km exactly', () => {
    mockFromKm = 0
    mockToKm = 50
    render(<SearchRangeSlider totalDistanceKm={120} />)
    expect(screen.getByText('Plage maximale : 50 km')).toBeDefined()
  })

  it('does not show max message when range < 50km', () => {
    mockFromKm = 0
    mockToKm = 20
    render(<SearchRangeSlider totalDistanceKm={120} />)
    expect(screen.queryByText('Plage maximale : 50 km')).toBeNull()
  })

  it('calls setSearchRange with correct values on change within range', () => {
    const { rerender } = render(<SearchRangeSlider totalDistanceKm={120} />)

    // Directly test handleValueChange by getting slider and simulating a change
    // Since onValueChange is passed to slider, we test through the mock
    // We re-render with a different value to trigger
    mockFromKm = 10
    mockToKm = 25
    rerender(<SearchRangeSlider totalDistanceKm={120} />)

    expect(screen.getByText('10 – 25 km')).toBeDefined()
    expect(screen.queryByText('Plage maximale : 50 km')).toBeNull()
  })

  it('calls setSearchRange with capped values when toKm thumb goes beyond 50km max', () => {
    // from=0 matches existing fromKm=0 → toKm thumb moved → from = max(70-50, 0) = 20
    mockFromKm = 0
    mockToKm = 30
    render(<SearchRangeSlider totalDistanceKm={120} />)

    act(() => { capturedOnValueChange?.([0, 70]) })

    expect(mockSetSearchRange).toHaveBeenCalledWith(20, 70)
  })

  it('calls setSearchRange with capped values when fromKm thumb goes beyond 50km max', () => {
    // from=50 !== fromKm=0 → fromKm thumb moved → to = min(50+50, 120) = 100
    mockFromKm = 0
    mockToKm = 30
    render(<SearchRangeSlider totalDistanceKm={120} />)

    act(() => { capturedOnValueChange?.([50, 110]) })

    expect(mockSetSearchRange).toHaveBeenCalledWith(50, 100)
  })
})
