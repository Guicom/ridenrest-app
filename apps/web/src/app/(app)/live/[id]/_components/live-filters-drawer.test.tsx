import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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
    Root:    ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-testid="drawer-root">{children}</div> : null,
    Portal:  ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Overlay: () => <div data-testid="drawer-overlay" />,
    Content: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="drawer-content" className={className}>{children}</div>
    ),
    Title:   ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByTestId('drawer-root')).toBeDefined()
  })

  it('does not render when open=false', () => {
    render(<LiveFiltersDrawer open={false} onOpenChange={() => {}} />)
    expect(screen.queryByTestId('drawer-root')).toBeNull()
  })

  it('X close button calls onOpenChange(false)', () => {
    const onOpenChange = vi.fn()
    render(<LiveFiltersDrawer open={true} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByTestId('filters-close-btn'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // ── PoiLayerGrid + sub-types ────────────────────────────────────────────────

  it('renders PoiLayerGrid with isPending=false', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const grid = screen.getByTestId('poi-layer-grid')
    expect(grid).toBeDefined()
    expect(grid.getAttribute('data-pending')).toBe('false')
  })

  it('shows accommodation sub-types when accommodations layer is active', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByTestId('accommodation-sub-types')).toBeDefined()
  })

  it('hides accommodation sub-types when accommodations layer is not active', () => {
    mockVisibleLayers = new Set<MapLayer>()
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.queryByTestId('accommodation-sub-types')).toBeNull()
  })

  // ── Météo accordion ─────────────────────────────────────────────────────────

  it('renders Météo accordion header with CloudRain icon', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByTestId('weather-accordion-header')).toBeDefined()
    expect(screen.getByText('Météo')).toBeDefined()
  })

  it('météo switch is hidden until accordion is expanded', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.queryByTestId('switch-weather')).toBeNull()
  })

  it('météo switch is visible after expanding accordion', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    expect(screen.getByTestId('switch-weather')).toBeDefined()
  })

  it('clicking météo switch calls setWeatherActive with toggled value', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    fireEvent.click(screen.getByTestId('switch-weather'))
    expect(mockSetWeatherActive).toHaveBeenCalledWith(true)
  })

  it('dimension segmented control visible when météo accordion is expanded', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    expect(screen.getByText('Temp.')).toBeDefined()
    expect(screen.getByText('Pluie')).toBeDefined()
    expect(screen.getByText('Vent')).toBeDefined()
  })

  it('departure time input is visible after expanding météo accordion', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    expect(screen.getByTestId('input-departure-time')).toBeDefined()
  })

  it('departure time input is hidden until accordion is expanded', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.queryByTestId('input-departure-time')).toBeNull()
  })

  it('departure time input initializes from store value', () => {
    mockWeatherDepartureTime = '2026-03-24T08:00'
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    const input = screen.getByTestId('input-departure-time') as HTMLInputElement
    expect(input.value).toBe('2026-03-24T08:00')
  })

  // ── Densité accordion ───────────────────────────────────────────────────────

  it('renders Densité accordion header with LayoutGrid icon', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByTestId('density-accordion-header')).toBeDefined()
    expect(screen.getByText('Densité')).toBeDefined()
  })

  it('densité switch is hidden until accordion is expanded', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.queryByTestId('switch-density')).toBeNull()
  })

  it('densité switch is visible after expanding accordion', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('density-accordion-header'))
    expect(screen.getByTestId('switch-density')).toBeDefined()
  })

  it('clicking densité switch calls toggleDensityColor', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('density-accordion-header'))
    fireEvent.click(screen.getByTestId('switch-density'))
    expect(mockToggleDensityColor).toHaveBeenCalled()
  })

  // ── Distance stepper ────────────────────────────────────────────────────────

  it('renders distance stepper with current radius', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByText('5 km')).toBeDefined()
  })

  it('stepper buttons have bg-white + border', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const btn = screen.getByLabelText('Augmenter le rayon')
    expect(btn.className).toContain('bg-white')
    expect(btn.className).toContain('border')
  })

  it('stepper increment increases radius', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByLabelText('Augmenter le rayon'))
    expect(screen.getByText('5.5 km')).toBeDefined()
  })

  it('stepper decrement decreases radius', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByLabelText('Diminuer le rayon'))
    expect(screen.getByText('4.5 km')).toBeDefined()
  })

  it('km display does not wrap (whitespace-nowrap)', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const kmSpan = screen.getByText('5 km')
    expect(kmSpan.className).toContain('whitespace-nowrap')
  })

  // ── Allure ──────────────────────────────────────────────────────────────────

  it('renders Allure input with current speedKmh', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const input = screen.getByTestId('input-speed') as HTMLInputElement
    expect(input.value).toBe('15')
  })

  // ── Apply button ─────────────────────────────────────────────────────────────

  it('search button is rounded-full h-12', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const btn = screen.getByTestId('search-btn')
    expect(btn.className).toContain('rounded-full')
    expect(btn.className).toContain('h-12')
  })

  it('search button is enabled when a POI layer is active', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect((screen.getByTestId('search-btn') as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows validation message when all POI layers off', () => {
    mockVisibleLayers = new Set<MapLayer>()
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByText('Sélectionne au moins un type de lieu')).toBeDefined()
  })

  it('search button is disabled when all POI layers off', () => {
    mockVisibleLayers = new Set<MapLayer>()
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect((screen.getByTestId('search-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('search button commits radius and speed, calls onSearch and onOpenChange', () => {
    const onOpenChange = vi.fn()
    const onSearch = vi.fn()
    render(<LiveFiltersDrawer open={true} onOpenChange={onOpenChange} onSearch={onSearch} />)
    fireEvent.change(screen.getByTestId('input-speed'), { target: { value: '20' } })
    fireEvent.click(screen.getByTestId('search-btn'))
    expect(mockSetSpeedKmh).toHaveBeenCalledWith(20)
    expect(mockSetSearchRadius).toHaveBeenCalledWith(5) // unchanged
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSearch).toHaveBeenCalled()
  })

  it('search button commits departure time when set', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('weather-accordion-header'))
    fireEvent.change(screen.getByTestId('input-departure-time'), { target: { value: '2026-03-24T08:00' } })
    fireEvent.click(screen.getByTestId('search-btn'))
    expect(mockSetWeatherDepartureTime).toHaveBeenCalledWith('2026-03-24T08:00')
  })

  it('search button commits null departure time when field is empty', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('search-btn'))
    expect(mockSetWeatherDepartureTime).toHaveBeenCalledWith(null)
  })

  // ── Étapes toggle ────────────────────────────────────────────────────────────

  it('renders Étapes label and switch', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByText('Étapes')).toBeDefined()
    expect(screen.getByTestId('switch-stages')).toBeDefined()
  })

  it('Étapes switch reflects stageLayerActive from store (false)', () => {
    mockStageLayerActive = false
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const sw = screen.getByTestId('switch-stages')
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('Étapes switch reflects stageLayerActive from store (true)', () => {
    mockStageLayerActive = true
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const sw = screen.getByTestId('switch-stages')
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('clicking Étapes switch calls setStageLayerActive with toggled value', () => {
    mockStageLayerActive = false
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    fireEvent.click(screen.getByTestId('switch-stages'))
    expect(mockSetStageLayerActive).toHaveBeenCalledWith(true)
  })
})
