import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SearchRangeControl } from './search-range-control'
import type { MapWaypoint } from '@ridenrest/shared'

afterEach(cleanup)

const mockSetSearchRange = vi.fn()
const mockSetSelectedStageId = vi.fn()
const mockSetSearchCommitted = vi.fn()
let mockFromKm = 0
let mockSelectedStageId: string | null = null
let mockSearchCommitted = false
let mockVisibleLayers = new Set<string>()

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    fromKm: mockFromKm,
    toKm: 15,
    setSearchRange: mockSetSearchRange,
    visibleLayers: mockVisibleLayers,
    selectedStageId: mockSelectedStageId,
    setSelectedStageId: mockSetSelectedStageId,
    searchCommitted: mockSearchCommitted,
    setSearchCommitted: mockSetSearchCommitted,
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
  computeElevationLoss: (points: Array<{ elevM?: number }>) => {
    let loss = 0
    for (let i = 1; i < points.length; i++) {
      const diff = (points[i]!.elevM ?? 0) - (points[i - 1]!.elevM ?? 0)
      if (diff < 0) loss += Math.abs(diff)
    }
    return loss
  },
}))

vi.mock('./poi-layer-grid', () => ({
  PoiLayerGrid: () => <div data-testid="poi-layer-grid" />,
}))

vi.mock('./accommodation-sub-types', () => ({
  AccommodationSubTypes: () => <div data-testid="accommodation-sub-types" />,
}))

let mockReverseCityResult: string | null = null
let mockReversePostcodeResult: string | null = null

vi.mock('@/hooks/use-reverse-city', () => ({
  useReverseCity: () => ({ city: mockReverseCityResult, postcode: mockReversePostcodeResult, isPending: false }),
}))

vi.mock('@/components/shared/search-on-dropdown', () => ({
  SearchOnDropdown: ({ center, city, postcode }: { center: object | null; city?: string | null; postcode?: string | null }) => (
    <div data-testid="search-on-dropdown" data-has-center={String(!!center)} data-city={city ?? ''} data-postcode={postcode ?? ''} />
  ),
}))

const makeWaypoints = (): MapWaypoint[] => [
  { lat: 0, lng: 0, ele: 100, distKm: 0 },
  { lat: 0, lng: 0, ele: 200, distKm: 5 },
  { lat: 0, lng: 0, ele: 150, distKm: 10 },
  { lat: 0, lng: 0, ele: 300, distKm: 20 },
]

const makeStage = (overrides = {}) => ({
  id: 's1', name: 'Jour 1', endKm: 80, startKm: 0, distanceKm: 80,
  color: '#f97316', orderIndex: 0, adventureId: 'a1',
  elevationGainM: null, elevationLossM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '',
  ...overrides,
})

describe('SearchRangeControl', () => {
  beforeEach(() => {
    mockSetSearchRange.mockClear()
    mockSetSelectedStageId.mockClear()
    mockSetSearchCommitted.mockClear()
    mockFromKm = 0
    mockSelectedStageId = null
    mockSearchCommitted = false
    mockVisibleLayers = new Set()
    mockReverseCityResult = null
    mockReversePostcodeResult = null
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

  it('shows current position (fromKm) in normal mode', () => {
    render(<SearchRangeControl totalDistanceKm={1487} waypoints={null} isPoisPending={false} />)
    expect(screen.getByTestId('current-position').textContent).toContain('0 km')
  })

  it('shows placeholder D+ when waypoints is null', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    expect(screen.getByText('↑ — m D+ · ↓ — m D-')).toBeDefined()
  })

  it('shows computed D+ when waypoints have elevation data (normal mode)', () => {
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
    expect(screen.getByText('↑ — m D+ · ↓ — m D-')).toBeDefined()
  })

  it('defaults rangeKm to 15 (from store initial values toKm - fromKm = 15 - 0)', () => {
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

  it('slider change calls setSearchRange with new fromKm + rangeKm (normal mode)', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '20' } })
    expect(mockSetSearchRange).toHaveBeenCalledWith(20, 35)
  })

  it('caps toKm at totalDistanceKm', () => {
    render(<SearchRangeControl totalDistanceKm={20} waypoints={null} isPoisPending={false} />)
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '15' } })
    expect(mockSetSearchRange).toHaveBeenCalledWith(15, 20)
  })

  it('does not show stage select when no stages provided', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    expect(screen.queryByTestId('stage-select')).toBeNull()
  })

  it('shows stage select when stages are provided', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} stages={[makeStage()]} />)
    expect(screen.getByTestId('stage-select')).toBeDefined()
    expect(screen.getByText('Début')).toBeDefined()
    expect(screen.getByText('Jour 1')).toBeDefined()
  })

  // ─── Mode étape : référentiel relatif ────────────────────────────────────────

  it('selecting a stage calls setSelectedStageId and setSearchRange from stage.endKm', () => {
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 80 })]} />)
    fireEvent.change(screen.getByTestId('stage-select'), { target: { value: 's1' } })
    expect(mockSetSelectedStageId).toHaveBeenCalledWith('s1')
    // from = stage.endKm = 80 (slider à 0), to = 80 + rangeKm (15) = 95
    expect(mockSetSearchRange).toHaveBeenCalledWith(80, 95)
  })

  it('in stage mode, km display shows relative km from stage endpoint (0 initially)', () => {
    mockFromKm = 80  // fromKm = stage.endKm → relative = 0
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 80 })]} />)
    expect(screen.getByTestId('current-position').textContent).toContain('0 km')
  })

  it('in stage mode, km display increments as fromKm moves ahead of stage endpoint', () => {
    mockFromKm = 90  // fromKm = 80 + 10 → relative = 10
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 80 })]} />)
    expect(screen.getByTestId('current-position').textContent).toContain('10 km')
  })

  it('in stage mode, slider value is 0 when fromKm equals stage.endKm', () => {
    mockFromKm = 80
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 80 })]} />)
    expect((screen.getByTestId('from-km-slider') as HTMLInputElement).value).toBe('0')
  })

  it('in stage mode, slider value reflects relative km (fromKm - stageEndKm)', () => {
    mockFromKm = 95  // 95 - 80 = 15 relative
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 80 })]} />)
    expect((screen.getByTestId('from-km-slider') as HTMLInputElement).value).toBe('15')
  })

  it('in stage mode, dragging slider converts relative value to absolute for setSearchRange', () => {
    // mockFromKm=0 so rangeKm initializes to 15; stageEndKm=80
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 80 })]} />)
    // User drags to relative km 20 → absolute = 80 + 20 = 100, to = 100 + 15 = 115
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '20' } })
    expect(mockSetSearchRange).toHaveBeenCalledWith(100, 115)
  })

  it('slider max in stage mode is totalDistanceKm - stageEndKm', () => {
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 80 })]} />)
    expect((screen.getByTestId('from-km-slider') as HTMLInputElement).max).toBe('120')  // 200 - 80
  })

  it('selecting Début clears stage selection', () => {
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} stages={[makeStage()]} />)
    fireEvent.change(screen.getByTestId('stage-select'), { target: { value: '' } })
    expect(mockSetSelectedStageId).toHaveBeenCalledWith(null)
  })

  it('clicking range increment calls setSelectedStageId(null) — AC5', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.click(screen.getByTestId('range-increment'))
    expect(mockSetSelectedStageId).toHaveBeenCalledWith(null)
  })

  it('clicking range decrement calls setSelectedStageId(null) — AC5', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.click(screen.getByTestId('range-decrement'))
    expect(mockSetSelectedStageId).toHaveBeenCalledWith(null)
  })

  it('range input blur with new value calls setSelectedStageId(null) — AC5', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    const input = screen.getByTestId('range-value') as HTMLInputElement
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.blur(input)
    expect(mockSetSelectedStageId).toHaveBeenCalledWith(null)
    expect(mockSetSearchRange).toHaveBeenCalledWith(0, 20)
  })

  it('dragging slider does not call setSelectedStageId — stage stays selected', () => {
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '20' } })
    expect(mockSetSelectedStageId).not.toHaveBeenCalled()
  })

  it('range input blur with same value does NOT clear stage selection — M1 fix', () => {
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 80 })]} />)
    const input = screen.getByTestId('range-value') as HTMLInputElement
    // Blur without changing the value (still '15')
    fireEvent.blur(input)
    expect(mockSetSelectedStageId).not.toHaveBeenCalled()
    expect(mockSetSearchRange).not.toHaveBeenCalled()
  })

  it('range display syncs to effective range when clamped at end of trace — M3 fix', () => {
    // stage.endKm=190, totalDistance=200, rangeKm=15 → effective range = 10
    mockSelectedStageId = 's1'
    render(<SearchRangeControl totalDistanceKm={200} waypoints={null} isPoisPending={false} stages={[makeStage({ endKm: 190 })]} />)
    // Selecting the stage triggers handleStageSelect → from=190, to=min(200,205)=200, effective=10
    fireEvent.change(screen.getByTestId('stage-select'), { target: { value: 's1' } })
    expect((screen.getByTestId('range-value') as HTMLInputElement).value).toBe('10')
  })

  it('slider at end of trace syncs range display to clamped value — M3 fix', () => {
    // totalDistance=100, rangeKm=15, slide to 90 → to=min(105,100)=100, effective=10
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    fireEvent.change(screen.getByTestId('from-km-slider'), { target: { value: '90' } })
    expect((screen.getByTestId('range-value') as HTMLInputElement).value).toBe('10')
  })

  it('in stage mode, D+ is computed from stageEndKm to fromKm (not from km 0)', () => {
    // waypoints: ele 100 at km 0, 200 at km 5, 150 at km 10, 300 at km 20
    // Stage endKm = 5, fromKm = 20 → D+ in [5, 20]: from 200→150 (loss) then 150→300 (+150) = 150m
    mockFromKm = 20
    mockSelectedStageId = 's1'
    render(
      <SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false}
        stages={[makeStage({ endKm: 5 })]} />,
    )
    const gain = screen.getByTestId('elevation-gain')
    expect(gain.textContent).toContain('150')
  })

  // ─── Rechercher sur dropdown ─────────────────────────────────────────────────

  it('shows SearchOnDropdown when searchCommitted, accommodations visible, not pending', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    expect(screen.getByTestId('search-on-dropdown')).toBeDefined()
  })

  it('hides SearchOnDropdown when accommodations layer not in visibleLayers', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['restaurants'])
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    expect(screen.queryByTestId('search-on-dropdown')).toBeNull()
  })

  it('hides SearchOnDropdown when isPoisPending=true', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={true} />)
    expect(screen.queryByTestId('search-on-dropdown')).toBeNull()
  })

  it('hides SearchOnDropdown when searchCommitted=false', () => {
    mockSearchCommitted = false
    mockVisibleLayers = new Set(['accommodations'])
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    expect(screen.queryByTestId('search-on-dropdown')).toBeNull()
  })

  it('shows SearchOnDropdown even when 0 POIs returned (only isPoisPending=false required)', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    expect(screen.getByTestId('search-on-dropdown')).toBeDefined()
  })

  it('SearchOnDropdown receives center when waypoints available — AC-4', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-has-center')).toBe('true')
  })

  it('SearchOnDropdown receives null center when waypoints=null — AC-8', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    render(<SearchRangeControl totalDistanceKm={100} waypoints={null} isPoisPending={false} />)
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-has-center')).toBe('false')
  })

  it('SearchOnDropdown receives null center when waypoints is empty array — AC-8', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    render(<SearchRangeControl totalDistanceKm={100} waypoints={[]} isPoisPending={false} />)
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-has-center')).toBe('false')
  })

  // ─── useReverseCity integration ───────────────────────────────────────────────

  it('passes city from useReverseCity to SearchOnDropdown when resolved', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    mockReverseCityResult = 'Toulouse'
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-city')).toBe('Toulouse')
  })

  it('passes null city to SearchOnDropdown when reverse geocoding not resolved', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    mockReverseCityResult = null
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-city')).toBe('')
  })

  it('passes postcode from useReverseCity to SearchOnDropdown', () => {
    mockSearchCommitted = true
    mockVisibleLayers = new Set(['accommodations'])
    mockReverseCityResult = 'Toulouse'
    mockReversePostcodeResult = '31000'
    render(<SearchRangeControl totalDistanceKm={100} waypoints={makeWaypoints()} isPoisPending={false} />)
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-postcode')).toBe('31000')
  })
})
