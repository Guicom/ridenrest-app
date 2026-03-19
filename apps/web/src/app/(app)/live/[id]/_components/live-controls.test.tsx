import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LiveControls } from './live-controls'
import { useLiveStore } from '@/stores/live.store'

afterEach(cleanup)

// Mock Slider (Base UI needs DOM features unavailable in jsdom)
vi.mock('@/components/ui/slider', () => ({
  Slider: (props: Record<string, unknown>) => (
    <input
      type="range"
      data-testid={props['data-testid'] as string}
      value={(props.value as number[])?.[0]}
      onChange={(e) => {
        const fn = props.onValueChange as (v: number | readonly number[]) => void
        fn([Number(e.target.value)])
      }}
    />
  ),
}))

describe('LiveControls', () => {
  beforeEach(() => {
    useLiveStore.setState({
      targetAheadKm: 30,
      searchRadiusKm: 3,
      speedKmh: 15,
      currentKmOnRoute: 10,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders toggle button with ETA summary', () => {
    render(<LiveControls />)
    const toggle = screen.getByTestId('live-controls-toggle')
    expect(toggle.textContent).toContain('30 km')
    expect(toggle.textContent).toContain('~2h00')
  })

  it('renders sliders and speed input when expanded', () => {
    render(<LiveControls />)
    expect(screen.getByTestId('slider-target')).toBeDefined()
    expect(screen.getByTestId('slider-radius')).toBeDefined()
    expect(screen.getByTestId('input-speed')).toBeDefined()
  })

  it('collapses when toggle is clicked', () => {
    render(<LiveControls />)
    fireEvent.click(screen.getByTestId('live-controls-toggle'))
    expect(screen.queryByTestId('slider-target')).toBeNull()
  })

  it('updates targetAheadKm when distance slider changes', () => {
    render(<LiveControls />)
    fireEvent.change(screen.getByTestId('slider-target'), { target: { value: '50' } })
    expect(useLiveStore.getState().targetAheadKm).toBe(50)
  })

  it('updates searchRadiusKm when radius slider changes', () => {
    render(<LiveControls />)
    fireEvent.change(screen.getByTestId('slider-radius'), { target: { value: '5' } })
    expect(useLiveStore.getState().searchRadiusKm).toBe(5)
  })

  it('updates speedKmh when speed input changes', () => {
    render(<LiveControls />)
    fireEvent.change(screen.getByTestId('input-speed'), { target: { value: '20' } })
    expect(useLiveStore.getState().speedKmh).toBe(20)
  })

  it('does not render weather panel (weather is on map overlay)', () => {
    render(<LiveControls />)
    expect(screen.queryByTestId('live-weather-panel')).toBeNull()
  })
})
