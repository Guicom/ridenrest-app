import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SearchRangeControl } from './search-range-control'
import type { MapWaypoint } from '@ridenrest/shared'

afterEach(cleanup)

const mockSetSearchRange = vi.fn()

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    fromKm: 0,
    toKm: 30,
    setSearchRange: mockSetSearchRange,
  }),
}))


vi.mock('@ridenrest/gpx', () => ({
  computeElevationGain: (points: Array<{ elevM?: number }>) => {
    // Simple mock: sum positive differences
    let gain = 0
    for (let i = 1; i < points.length; i++) {
      const diff = (points[i]!.elevM ?? 0) - (points[i - 1]!.elevM ?? 0)
      if (diff > 0) gain += diff
    }
    return gain
  },
}))

const makeWaypoints = (): MapWaypoint[] => [
  { lat: 0, lng: 0, ele: 100, distKm: 0 },
  { lat: 0, lng: 0, ele: 200, distKm: 5 },
  { lat: 0, lng: 0, ele: 150, distKm: 10 },
  { lat: 0, lng: 0, ele: 300, distKm: 20 },
]

describe('SearchRangeControl', () => {
  beforeEach(() => {
    mockSetSearchRange.mockClear()
  })

  it('renders section header with Recherche label', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    expect(screen.getByText('Recherche')).toBeDefined()
  })

  it('is expanded by default', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    expect(screen.getByTestId('from-km-slider')).toBeDefined()
  })

  it('clicking header collapses the section', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    fireEvent.click(screen.getByTestId('search-range-header'))
    expect(screen.queryByTestId('from-km-slider')).toBeNull()
  })

  it('shows total distance', () => {
    render(<SearchRangeControl totalDistanceKm={1487} waypoints={null} />)
    expect(screen.getByTestId('total-distance').textContent).toContain('487 km')
  })

  it('shows placeholder D+ when waypoints is null', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    expect(screen.getByText('↑ — m D+')).toBeDefined()
  })

  it('shows computed D+ when waypoints have elevation data', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} />)
    // fromKm=0, toKm=30 (store defaults), rangeKm=15 → toKm=15 in store but we test the display
    expect(screen.getByTestId('elevation-gain')).toBeDefined()
  })

  it('shows placeholder D+ when waypoints have no elevation', () => {
    const noEle: MapWaypoint[] = [
      { lat: 0, lng: 0, ele: null, distKm: 0 },
      { lat: 0, lng: 0, ele: null, distKm: 5 },
    ]
    render(<SearchRangeControl totalDistanceKm={100} waypoints={noEle} />)
    expect(screen.getByText('↑ — m D+')).toBeDefined()
  })

  it('defaults rangeKm to 15 when store is at initial values (0, 30)', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    expect(screen.getByTestId('range-value').textContent).toBe('15 km')
  })

  it('increment button increases rangeKm', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    fireEvent.click(screen.getByTestId('range-increment'))
    expect(screen.getByTestId('range-value').textContent).toBe('16 km')
    expect(mockSetSearchRange).toHaveBeenCalledWith(0, 16)
  })

  it('decrement button decreases rangeKm', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    fireEvent.click(screen.getByTestId('range-decrement'))
    expect(screen.getByTestId('range-value').textContent).toBe('14 km')
    expect(mockSetSearchRange).toHaveBeenCalledWith(0, 14)
  })

  it('decrement is disabled at min (1 km)', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    for (let i = 0; i < 14; i++) {
      fireEvent.click(screen.getByTestId('range-decrement'))
    }
    expect(screen.getByTestId('range-decrement')).toHaveProperty('disabled', true)
  })

  it('increment is disabled at max (30 km)', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    for (let i = 0; i < 15; i++) {
      fireEvent.click(screen.getByTestId('range-increment'))
    }
    expect(screen.getByTestId('range-increment')).toHaveProperty('disabled', true)
  })

  it('slider change calls setSearchRange with new fromKm + rangeKm', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} />)
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '20' } })
    expect(mockSetSearchRange).toHaveBeenCalledWith(20, 35)
  })

  it('caps toKm at totalDistanceKm', () => {
    render(<SearchRangeControl totalDistanceKm={20} waypoints={null} />)
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '15' } })
    expect(mockSetSearchRange).toHaveBeenCalledWith(15, 20)
  })
})
