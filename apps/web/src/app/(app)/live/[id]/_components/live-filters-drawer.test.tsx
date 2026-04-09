import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LiveFiltersDrawer } from './live-filters-drawer'
import type { MapLayer } from '@ridenrest/shared'

afterEach(cleanup)

// ── Store mocks ───────────────────────────────────────────────────────────────

const mockSetWeatherActive        = vi.fn()
const mockSetWeatherDimension     = vi.fn()
const mockToggleDensityColor      = vi.fn()
const mockSetSearchRadius         = vi.fn()
const mockSetSpeedKmh             = vi.fn()
const mockSetWeatherDepartureTime = vi.fn()
const mockSetStageLayerActive     = vi.fn()

let mockVisibleLayers        = new Set<MapLayer>(['accommodations'])
let mockWeatherActive        = false
let mockWeatherDimension     = 'temperature'
let mockDensityColorEnabled  = true
let mockSearchRadiusKm       = 5
let mockSpeedKmh             = 15
let mockWeatherDepartureTime = ''
let mockStageLayerActive     = false

vi.mock('@/stores/map.store', () => ({
  useMapStore: (selector?: (s: unknown) => unknown) => {
    const state = {
      visibleLayers:        mockVisibleLayers,
      weatherActive:        mockWeatherActive,
      weatherDimension:     mockWeatherDimension,
      densityColorEnabled:  mockDensityColorEnabled,
      setWeatherActive:     mockSetWeatherActive,
      setWeatherDimension:  mockSetWeatherDimension,
      toggleDensityColor:   mockToggleDensityColor,
      // PoiLayerGrid uses toggleLayer
      toggleLayer: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/stores/live.store', () => ({
  useLiveStore: (selector: (s: unknown) => unknown) => selector({
    searchRadiusKm:           mockSearchRadiusKm,
    speedKmh:                 mockSpeedKmh,
    weatherDepartureTime:     mockWeatherDepartureTime,
    stageLayerActive:         mockStageLayerActive,
    setSearchRadius:          mockSetSearchRadius,
    setSpeedKmh:              mockSetSpeedKmh,
    setWeatherDepartureTime:  mockSetWeatherDepartureTime,
    setStageLayerActive:      mockSetStageLayerActive,
  }),
}))

// ── Density / API mocks ──────────────────────────────────────────────────────

vi.mock('@/hooks/use-density', () => ({
  useDensity: () => ({
    coverageGaps: [],
    densityStatus: 'idle',
    densityCategories: [],
    densityStale: false,
    densityProgress: 0,
    isPending: false,
  }),
}))

vi.mock('@/lib/api-client', () => ({
  triggerDensityAnalysis: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/app/(app)/adventures/[id]/_components/density-category-dialog', () => ({
  DensityCategoryDialog: () => null,
}))

// ── Planning-mode component mocks ─────────────────────────────────────────────

vi.mock('@/app/(app)/map/[id]/_components/poi-layer-grid', () => ({
  PoiLayerGrid: ({ isPending }: { isPending: boolean }) => (
    <div data-testid="poi-layer-grid" data-pending={isPending} />
  ),
}))

vi.mock('@/app/(app)/map/[id]/_components/accommodation-sub-types', () => ({
  AccommodationSubTypes: ({ accommodationPois }: { accommodationPois?: unknown[] }) => (
    <div data-testid="accommodation-sub-types" data-pois={accommodationPois?.length ?? 0} />
  ),
  ACCOMMODATION_SUB_TYPES: [],
  computeAccCountByType: () => null,
}))

// ── StageCard mock ───────────────────────────────────────────────────────────

vi.mock('@/components/shared/stage-card', () => ({
  StageCard: ({ stage, mode, isCurrent, isPassed, etaFromCurrentMinutes }: {
    stage: { id: string; name: string }
    mode: string
    isCurrent?: boolean
    isPassed?: boolean
    etaFromCurrentMinutes?: number | null
  }) => (
    <div
      data-testid={`stage-card-${stage.id}`}
      data-mode={mode}
      data-current={isCurrent ?? false}
      data-passed={isPassed ?? false}
      data-eta={etaFromCurrentMinutes ?? ''}
    >
      {stage.name}
    </div>
  ),
}))

// ── UI mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, 'aria-label': ariaLabel, 'data-testid': testId }: {
    checked: boolean
    onCheckedChange: (v: boolean) => void
    'aria-label'?: string
    'data-testid'?: string
  }) => (
    <button role="switch" aria-checked={checked} aria-label={ariaLabel} data-testid={testId}
      onClick={() => onCheckedChange(!checked)} />
  ),
}))

vi.mock('vaul', () => ({
  Drawer: {
    Root:    ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange?: (v: boolean) => void }) =>
      open ? <div data-testid="drawer-root"><button data-testid="drawer-swipe-close" onClick={() => onOpenChange?.(false)} />{children}</div> : null,
    Portal:  ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Overlay: () => <div data-testid="drawer-overlay" />,
    Content: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="drawer-content" className={className}>{children}</div>
    ),
    Title:   ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultDrawerProps = {
  adventureId: 'adv-1',
  segments: [{ id: 'seg-1', name: 'Seg 1', orderIndex: 0, cumulativeStartKm: 0, distanceKm: 50, parseStatus: 'done' as const, waypoints: [{ lat: 1, lng: 2, distKm: 0 }], boundingBox: null }],
}

function renderDrawer(props: Partial<React.ComponentProps<typeof LiveFiltersDrawer>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LiveFiltersDrawer open={true} onOpenChange={() => {}} {...defaultDrawerProps} {...props} />
    </QueryClientProvider>,
  )
}

function resetMocks() {
  mockSetWeatherActive.mockClear()
  mockSetWeatherDimension.mockClear()
  mockToggleDensityColor.mockClear()
  mockSetSearchRadius.mockClear()
  mockSetSpeedKmh.mockClear()
  mockSetWeatherDepartureTime.mockClear()
  mockSetStageLayerActive.mockClear()
  mockVisibleLayers        = new Set<MapLayer>(['accommodations'])
  mockWeatherActive        = false
  mockWeatherDimension     = 'temperature'
  mockDensityColorEnabled  = true
  mockSearchRadiusKm       = 5
  mockSpeedKmh             = 15
  mockWeatherDepartureTime = ''
  mockStageLayerActive     = false
}

describe('LiveFiltersDrawer', () => {
  afterEach(resetMocks)

  // ── Open/close ──────────────────────────────────────────────────────────────

  it('renders drawer when open=true', () => {
    renderDrawer()
    expect(screen.getByTestId('drawer-root')).toBeDefined()
  })

  it('does not render when open=false', () => {
    renderDrawer({ open: false })
    expect(screen.queryByTestId('drawer-root')).toBeNull()
  })

  it('X close button calls onOpenChange(false)', () => {
    const onOpenChange = vi.fn()
    renderDrawer({ onOpenChange })
    fireEvent.click(screen.getByTestId('filters-close-btn'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // ── PoiLayerGrid + sub-types ────────────────────────────────────────────────

  it('renders PoiLayerGrid with isPending=false', () => {
    renderDrawer()
    const grid = screen.getByTestId('poi-layer-grid')
    expect(grid).toBeDefined()
    expect(grid.getAttribute('data-pending')).toBe('false')
  })

  it('shows accommodation sub-types when accommodations layer is active', () => {
    renderDrawer()
    expect(screen.getByTestId('accommodation-sub-types')).toBeDefined()
  })

  it('hides accommodation sub-types when accommodations layer is not active', () => {
    mockVisibleLayers = new Set<MapLayer>()
    renderDrawer()
    expect(screen.queryByTestId('accommodation-sub-types')).toBeNull()
  })

  // ── Météo accordion ─────────────────────────────────────────────────────────

  it('renders Météo accordion header with CloudRain icon', () => {
    renderDrawer()
    expect(screen.getByTestId('weather-accordion-header')).toBeDefined()
    expect(screen.getByText('Météo')).toBeDefined()
  })

  it('météo switch is hidden until accordion is expanded', () => {
    renderDrawer()
    expect(screen.queryByTestId('switch-weather')).toBeNull()
  })

  it('météo switch is visible after expanding accordion', () => {
    renderDrawer()
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    expect(screen.getByTestId('switch-weather')).toBeDefined()
  })

  it('clicking météo switch calls setWeatherActive with toggled value', () => {
    renderDrawer()
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    fireEvent.click(screen.getByTestId('switch-weather'))
    expect(mockSetWeatherActive).toHaveBeenCalledWith(true)
  })

  it('dimension segmented control visible when météo accordion is expanded', () => {
    renderDrawer()
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    expect(screen.getByText('Temp.')).toBeDefined()
    expect(screen.getByText('Pluie')).toBeDefined()
    expect(screen.getByText('Vent')).toBeDefined()
  })

  it('departure time input is visible after expanding météo accordion', () => {
    renderDrawer()
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    expect(screen.getByTestId('input-departure-time')).toBeDefined()
  })

  it('departure time input is hidden until accordion is expanded', () => {
    renderDrawer()
    expect(screen.queryByTestId('input-departure-time')).toBeNull()
  })

  it('departure time input initializes from store value', () => {
    mockWeatherDepartureTime = '2026-03-24T08:00'
    renderDrawer()
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    const input = screen.getByTestId('input-departure-time') as HTMLInputElement
    expect(input.value).toBe('2026-03-24T08:00')
  })

  // ── Densité accordion ───────────────────────────────────────────────────────

  it('renders Densité accordion header with LayoutGrid icon', () => {
    renderDrawer()
    expect(screen.getByTestId('density-accordion-header')).toBeDefined()
    expect(screen.getByText('Densité')).toBeDefined()
  })

  it('densité CTA is hidden until accordion is expanded', () => {
    renderDrawer()
    expect(screen.queryByTestId('live-density-cta-btn')).toBeNull()
  })

  it('densité CTA is visible after expanding accordion when status is idle', () => {
    renderDrawer()
    fireEvent.click(screen.getByTestId('density-accordion-header'))
    expect(screen.getByTestId('live-density-cta-btn')).toBeDefined()
    expect(screen.getByText(/Calculer la densité/)).toBeDefined()
  })

  // ── Distance stepper ────────────────────────────────────────────────────────

  it('renders distance stepper with current radius', () => {
    renderDrawer()
    expect(screen.getByText('5 km')).toBeDefined()
  })

  it('stepper buttons have bg-white + border', () => {
    renderDrawer()
    const btn = screen.getByLabelText('Augmenter le rayon')
    expect(btn.className).toContain('bg-white')
    expect(btn.className).toContain('border')
  })

  it('stepper increment increases radius', () => {
    renderDrawer()
    fireEvent.click(screen.getByLabelText('Augmenter le rayon'))
    expect(screen.getByText('5.5 km')).toBeDefined()
  })

  it('stepper decrement decreases radius', () => {
    renderDrawer()
    fireEvent.click(screen.getByLabelText('Diminuer le rayon'))
    expect(screen.getByText('4.5 km')).toBeDefined()
  })

  it('km display does not wrap (whitespace-nowrap)', () => {
    renderDrawer()
    const kmSpan = screen.getByText('5 km')
    expect(kmSpan.className).toContain('whitespace-nowrap')
  })

  // ── Allure ──────────────────────────────────────────────────────────────────

  it('renders Allure input with current speedKmh', () => {
    renderDrawer()
    const input = screen.getByTestId('input-speed') as HTMLInputElement
    expect(input.value).toBe('15')
  })

  // ── Apply button ─────────────────────────────────────────────────────────────

  it('search button is rounded-full h-12', () => {
    renderDrawer()
    const btn = screen.getByTestId('search-btn')
    expect(btn.className).toContain('rounded-full')
    expect(btn.className).toContain('h-12')
  })

  it('search button is enabled when a POI layer is active', () => {
    renderDrawer()
    expect((screen.getByTestId('search-btn') as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows validation message when all POI layers off', () => {
    mockVisibleLayers = new Set<MapLayer>()
    renderDrawer()
    expect(screen.getByText('Sélectionne au moins un type de lieu')).toBeDefined()
  })

  it('search button is disabled when all POI layers off', () => {
    mockVisibleLayers = new Set<MapLayer>()
    renderDrawer()
    expect((screen.getByTestId('search-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('search button commits radius and speed, calls onSearch and onOpenChange', () => {
    const onOpenChange = vi.fn()
    const onSearch = vi.fn()
    renderDrawer({ onOpenChange, onSearch })
    fireEvent.change(screen.getByTestId('input-speed'), { target: { value: '20' } })
    fireEvent.click(screen.getByTestId('search-btn'))
    expect(mockSetSpeedKmh).toHaveBeenCalledWith(20)
    expect(mockSetSearchRadius).toHaveBeenCalledWith(5) // unchanged
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSearch).toHaveBeenCalled()
  })

  it('search button commits departure time when set', () => {
    renderDrawer()
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    fireEvent.change(screen.getByTestId('input-departure-time'), { target: { value: '2026-03-24T08:00' } })
    fireEvent.click(screen.getByTestId('search-btn'))
    expect(mockSetWeatherDepartureTime).toHaveBeenCalledWith('2026-03-24T08:00')
  })

  it('search button commits null departure time when field is empty', () => {
    renderDrawer()
    fireEvent.click(screen.getByTestId('search-btn'))
    expect(mockSetWeatherDepartureTime).toHaveBeenCalledWith(null)
  })

  // ── Étapes toggle ────────────────────────────────────────────────────────────

  it('renders Étapes label and switch', () => {
    renderDrawer()
    expect(screen.getByText('Étapes')).toBeDefined()
    expect(screen.getByTestId('switch-stages')).toBeDefined()
  })

  it('Étapes switch reflects stageLayerActive from store (false)', () => {
    mockStageLayerActive = false
    renderDrawer()
    const sw = screen.getByTestId('switch-stages')
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('Étapes switch reflects stageLayerActive from store (true)', () => {
    mockStageLayerActive = true
    renderDrawer()
    const sw = screen.getByTestId('switch-stages')
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('clicking Étapes switch calls setStageLayerActive with toggled value', () => {
    mockStageLayerActive = false
    renderDrawer()
    fireEvent.click(screen.getByTestId('switch-stages'))
    expect(mockSetStageLayerActive).toHaveBeenCalledWith(true)
  })

  // ── Story 16.25: Persist values on close without search ─────────────────────

  it('closing via X persists modified radius to store', () => {
    const onOpenChange = vi.fn()
    renderDrawer({ onOpenChange })
    fireEvent.click(screen.getByLabelText('Augmenter le rayon'))
    fireEvent.click(screen.getByTestId('filters-close-btn'))
    expect(mockSetSearchRadius).toHaveBeenCalledWith(5.5)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closing via swipe/overlay persists modified radius to store', () => {
    const onOpenChange = vi.fn()
    renderDrawer({ onOpenChange })
    fireEvent.click(screen.getByLabelText('Diminuer le rayon'))
    fireEvent.click(screen.getByTestId('drawer-swipe-close'))
    expect(mockSetSearchRadius).toHaveBeenCalledWith(4.5)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('reopening drawer shows previously persisted radius', () => {
    // Simulate that the store was updated by a previous close
    mockSearchRadiusKm = 7
    renderDrawer()
    expect(screen.getByText('7 km')).toBeDefined()
  })

  it('closing without modifying commits original values (idempotent no-op)', () => {
    const onOpenChange = vi.fn()
    renderDrawer({ onOpenChange })
    fireEvent.click(screen.getByTestId('filters-close-btn'))
    // Setters called with original values — Zustand ignores identical state
    expect(mockSetSearchRadius).toHaveBeenCalledWith(5)
    expect(mockSetSpeedKmh).toHaveBeenCalledWith(15)
    expect(mockSetWeatherDepartureTime).toHaveBeenCalledWith(null)
  })

  it('search button still commits + calls onSearch (existing behavior preserved)', () => {
    const onOpenChange = vi.fn()
    const onSearch = vi.fn()
    renderDrawer({ onOpenChange, onSearch })
    fireEvent.click(screen.getByLabelText('Augmenter le rayon'))
    fireEvent.click(screen.getByTestId('search-btn'))
    expect(mockSetSearchRadius).toHaveBeenCalledWith(5.5)
    expect(onSearch).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closing via X does NOT call onSearch', () => {
    const onSearch = vi.fn()
    renderDrawer({ onSearch })
    fireEvent.click(screen.getByLabelText('Augmenter le rayon'))
    fireEvent.click(screen.getByTestId('filters-close-btn'))
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('closing via X persists modified speed to store', () => {
    renderDrawer()
    fireEvent.change(screen.getByTestId('input-speed'), { target: { value: '20' } })
    fireEvent.click(screen.getByTestId('filters-close-btn'))
    expect(mockSetSpeedKmh).toHaveBeenCalledWith(20)
  })

  it('closing via X persists modified departure time to store', () => {
    renderDrawer()
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    fireEvent.change(screen.getByTestId('input-departure-time'), { target: { value: '2026-04-01T09:00' } })
    fireEvent.click(screen.getByTestId('filters-close-btn'))
    expect(mockSetWeatherDepartureTime).toHaveBeenCalledWith('2026-04-01T09:00')
  })

  // ── Story 17.6: Stages accordion with StageCards ───────────────────────────

  const stageFixtures = [
    { id: 's1', adventureId: 'adv-1', name: 'Étape 1', startKm: 0, endKm: 30, distanceKm: 30, elevationGainM: 500, elevationLossM: 300, color: '#e11d48', orderIndex: 0, departureTime: null, createdAt: '', updatedAt: '' },
    { id: 's2', adventureId: 'adv-1', name: 'Étape 2', startKm: 30, endKm: 60, distanceKm: 30, elevationGainM: 200, elevationLossM: 400, color: '#2563eb', orderIndex: 1, departureTime: null, createdAt: '', updatedAt: '' },
    { id: 's3', adventureId: 'adv-1', name: 'Étape 3', startKm: 60, endKm: 100, distanceKm: 40, elevationGainM: 800, elevationLossM: 600, color: '#16a34a', orderIndex: 2, departureTime: null, createdAt: '', updatedAt: '' },
  ]

  it('shows accordion with StageCards when stages are provided', () => {
    renderDrawer({ stages: stageFixtures })
    expect(screen.getByTestId('stages-accordion')).toBeDefined()
    expect(screen.getByTestId('stages-accordion-header')).toBeDefined()
    expect(screen.getByText('Étapes (3)')).toBeDefined()
  })

  it('stages accordion is collapsed by default — StageCards not visible', () => {
    renderDrawer({ stages: stageFixtures })
    expect(screen.queryByTestId('stages-list')).toBeNull()
    expect(screen.queryByTestId('stage-card-s1')).toBeNull()
  })

  it('expanding stages accordion shows all StageCards', () => {
    renderDrawer({ stages: stageFixtures })
    fireEvent.click(screen.getByTestId('stages-accordion-header'))
    expect(screen.getByTestId('stages-list')).toBeDefined()
    expect(screen.getByTestId('stage-card-s1')).toBeDefined()
    expect(screen.getByTestId('stage-card-s2')).toBeDefined()
    expect(screen.getByTestId('stage-card-s3')).toBeDefined()
  })

  it('StageCards receive mode="live"', () => {
    renderDrawer({ stages: stageFixtures })
    fireEvent.click(screen.getByTestId('stages-accordion-header'))
    expect(screen.getByTestId('stage-card-s1').getAttribute('data-mode')).toBe('live')
  })

  it('switch-stages is in accordion header and still toggles stageLayerActive', () => {
    mockStageLayerActive = false
    renderDrawer({ stages: stageFixtures })
    // Switch is visible even when accordion is collapsed
    const sw = screen.getByTestId('switch-stages')
    expect(sw).toBeDefined()
    fireEvent.click(sw)
    expect(mockSetStageLayerActive).toHaveBeenCalledWith(true)
  })

  it('toggling switch in header does NOT expand accordion', () => {
    renderDrawer({ stages: stageFixtures })
    fireEvent.click(screen.getByTestId('switch-stages'))
    // Accordion should remain collapsed
    expect(screen.queryByTestId('stages-list')).toBeNull()
  })

  it('shows simple toggle (no accordion) when stages array is empty', () => {
    renderDrawer({ stages: [] })
    expect(screen.queryByTestId('stages-accordion')).toBeNull()
    expect(screen.getByText('Étapes')).toBeDefined()
    expect(screen.getByTestId('switch-stages')).toBeDefined()
  })

  it('shows simple toggle when stages prop is not provided', () => {
    renderDrawer()
    expect(screen.queryByTestId('stages-accordion')).toBeNull()
    expect(screen.getByText('Étapes')).toBeDefined()
    expect(screen.getByTestId('switch-stages')).toBeDefined()
  })

  it('marks current stage with isCurrent=true based on currentKmOnRoute', () => {
    renderDrawer({ stages: stageFixtures, currentKmOnRoute: 40, liveSpeedKmh: 15 })
    fireEvent.click(screen.getByTestId('stages-accordion-header'))
    // s2 is current (40 >= 30 && 40 < 60)
    expect(screen.getByTestId('stage-card-s2').getAttribute('data-current')).toBe('true')
    expect(screen.getByTestId('stage-card-s2').getAttribute('data-passed')).toBe('false')
  })

  it('marks passed stages with isPassed=true', () => {
    renderDrawer({ stages: stageFixtures, currentKmOnRoute: 40, liveSpeedKmh: 15 })
    fireEvent.click(screen.getByTestId('stages-accordion-header'))
    // s1 is passed (40 >= 30)
    expect(screen.getByTestId('stage-card-s1').getAttribute('data-passed')).toBe('true')
    expect(screen.getByTestId('stage-card-s1').getAttribute('data-current')).toBe('false')
  })

  it('computes ETA for non-passed stages when GPS position is available', () => {
    renderDrawer({ stages: stageFixtures, currentKmOnRoute: 40, liveSpeedKmh: 20 })
    fireEvent.click(screen.getByTestId('stages-accordion-header'))
    // s2 ETA: (60 - 40) / 20 * 60 = 60 min
    expect(screen.getByTestId('stage-card-s2').getAttribute('data-eta')).toBe('60')
    // s3 ETA: (100 - 40) / 20 * 60 = 180 min
    expect(screen.getByTestId('stage-card-s3').getAttribute('data-eta')).toBe('180')
  })

  it('does not compute ETA for passed stages', () => {
    renderDrawer({ stages: stageFixtures, currentKmOnRoute: 40, liveSpeedKmh: 20 })
    fireEvent.click(screen.getByTestId('stages-accordion-header'))
    // s1 is passed — no ETA
    expect(screen.getByTestId('stage-card-s1').getAttribute('data-eta')).toBe('')
  })

  it('stages list has max-h-64 overflow-y-auto for scrollability', () => {
    renderDrawer({ stages: stageFixtures })
    fireEvent.click(screen.getByTestId('stages-accordion-header'))
    const list = screen.getByTestId('stages-list')
    expect(list.className).toContain('max-h-64')
    expect(list.className).toContain('overflow-y-auto')
  })
})
