import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SearchRangeControl } from './search-range-control'
import type { MapWaypoint } from '@ridenrest/shared'

afterEach(cleanup)

const mockSetSearchRange = vi.fn()
let mockFromKm = 0

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    fromKm: mockFromKm,
    toKm: 30,
    setSearchRange: mockSetSearchRange,
    visibleLayers: new Set(),
  }),
}))

vi.mock('@ridenrest/gpx', () => ({
  computeElevationGain: (points: Array<{ elevM?: number }>) => {
    let gain = 0
    for (let i = 1; i < points.length; i++) {
      const diff = (points[i]!.elevM ?? 0) - (points[i - 1]!.elevM ?? 0)
      if (diff > 0) gain += diff
    }
    return gain
  },
}))

vi.mock('./poi-layer-grid', () => ({
  PoiLayerGrid: () => <div data-testid="poi-layer-grid" />,
}))

vi.mock('./accommodation-sub-types', () => ({
  AccommodationSubTypes: () => <div data-testid="accommodation-sub-types" />,
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
    mockFromKm = 0
  })

  it('renders section header with Recherche label', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    expect(screen.getByText('Recherche')).toBeDefined()
  })

  it('is expanded by default', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    expect(screen.getByTestId('from-km-slider')).toBeDefined()
  })

  it('clicking header collapses the section', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.click(screen.getByTestId('search-range-header'))
    expect(screen.queryByTestId('from-km-slider')).toBeNull()
  })

  it('shows current position (fromKm)', () => {
    render(<SearchRangeControl totalDistanceKm={1487} waypoints={null} isPoisPending={false} />)
    expect(screen.getByTestId('current-position').textContent).toContain('0 km')
  })

  it('shows placeholder D+ when waypoints is null', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    expect(screen.getByText('↑ — m D+')).toBeDefined()
  })

  it('shows computed D+ when waypoints have elevation data', () => {
    mockFromKm = 10
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    expect(screen.getByTestId('elevation-gain')).toBeDefined()
  })

  it('shows placeholder D+ when waypoints have no elevation', () => {
    const noEle: MapWaypoint[] = [
      { lat: 0, lng: 0, ele: null, distKm: 0 },
      { lat: 0, lng: 0, ele: null, distKm: 5 },
    ]
    render(<SearchRangeControl totalDistanceKm={100} waypoints={noEle} isPoisPending={false} />)
    expect(screen.getByText('↑ — m D+')).toBeDefined()
  })

  it('defaults rangeKm to 15 when store is at initial values (0, 30)', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    expect((screen.getByTestId('range-value') as HTMLInputElement).value).toBe('15')
  })

  it('increment button increases rangeKm', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.click(screen.getByTestId('range-increment'))
    expect((screen.getByTestId('range-value') as HTMLInputElement).value).toBe('16')
    expect(mockSetSearchRange).toHaveBeenCalledWith(0, 16)
  })

  it('decrement button decreases rangeKm', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.click(screen.getByTestId('range-decrement'))
    expect((screen.getByTestId('range-value') as HTMLInputElement).value).toBe('14')
    expect(mockSetSearchRange).toHaveBeenCalledWith(0, 14)
  })

  it('decrement is disabled at min (1 km)', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    for (let i = 0; i < 14; i++) {
      fireEvent.click(screen.getByTestId('range-decrement'))
    }
    expect(screen.getByTestId('range-decrement')).toHaveProperty('disabled', true)
  })

  it('increment is disabled at max (50 km)', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    for (let i = 0; i < 35; i++) {
      fireEvent.click(screen.getByTestId('range-increment'))
    }
    expect(screen.getByTestId('range-increment')).toHaveProperty('disabled', true)
  })

  it('slider change calls setSearchRange with new fromKm + rangeKm', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '20' } })
    expect(mockSetSearchRange).toHaveBeenCalledWith(20, 35)
  })

  it('caps toKm at totalDistanceKm', () => {
    render(<SearchRangeControl totalDistanceKm={20} waypoints={null} isPoisPending={false} />)
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '15' } })
    expect(mockSetSearchRange).toHaveBeenCalledWith(15, 20)
  })
})
