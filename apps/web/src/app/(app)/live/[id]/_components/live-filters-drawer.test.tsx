import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LiveFiltersDrawer } from './live-filters-drawer'
import type { MapLayer, PoiCategory } from '@ridenrest/shared'

afterEach(cleanup)

// vi.hoisted ensures these are available when vi.mock factory is hoisted to top of file
const { mockSetState } = vi.hoisted(() => ({ mockSetState: vi.fn() }))

const mockSetSearchRadius = vi.fn()
let mockSearchRadiusKm = 5
let mockVisibleLayers = new Set<MapLayer>(['accommodations'])
let mockWeatherActive = false
let mockDensityColorEnabled = true
let mockActiveAccommodationTypes = new Set<PoiCategory>(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])

vi.mock('@/stores/map.store', () => {
  const mockFn = Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const state = {
        visibleLayers: mockVisibleLayers,
        weatherActive: mockWeatherActive,
        densityColorEnabled: mockDensityColorEnabled,
        activeAccommodationTypes: mockActiveAccommodationTypes,
      }
      return selector ? selector(state) : state
    },
    { setState: mockSetState },
  )
  return { useMapStore: mockFn }
})

vi.mock('@/stores/live.store', () => ({
  useLiveStore: (selector: (s: unknown) => unknown) => {
    const state = {
      searchRadiusKm: mockSearchRadiusKm,
      setSearchRadius: mockSetSearchRadius,
    }
    return selector(state)
  },
}))

// Mock vaul Drawer
vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-testid="drawer-root">{children}</div> : null,
    Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Overlay: () => <div data-testid="drawer-overlay" />,
    Content: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="drawer-content" className={className}>{children}</div>
    ),
    Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  },
}))

describe('LiveFiltersDrawer', () => {
  afterEach(() => {
    mockSetSearchRadius.mockClear()
    mockSetState.mockClear()
    mockVisibleLayers = new Set<MapLayer>(['accommodations'])
    mockWeatherActive = false
    mockDensityColorEnabled = true
    mockActiveAccommodationTypes = new Set<PoiCategory>(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockSearchRadiusKm = 5
  })

  it('renders drawer when open=true', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByTestId('drawer-root')).toBeDefined()
  })

  it('does not render when open=false', () => {
    render(<LiveFiltersDrawer open={false} onOpenChange={() => {}} />)
    expect(screen.queryByTestId('drawer-root')).toBeNull()
  })

  it('renders POI grid cards (4 POI) and Météo/Densité toggles', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByText(/Hébergements/)).toBeDefined()
    expect(screen.getByText(/Restauration/)).toBeDefined()
    expect(screen.getByText(/Alimentation/)).toBeDefined()
    expect(screen.getByText(/Vélo/)).toBeDefined()
    expect(screen.getByText(/Météo/)).toBeDefined()
    expect(screen.getByText(/Densité/)).toBeDefined()
  })

  it('renders distance stepper', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByLabelText('Augmenter le rayon')).toBeDefined()
    expect(screen.getByLabelText('Diminuer le rayon')).toBeDefined()
    expect(screen.getByText('5 km')).toBeDefined()
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

  it('apply button is enabled when at least one POI layer is active', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const applyBtn = screen.getByText('Appliquer les filtres')
    expect((applyBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows validation message when all POI layers are off', () => {
    mockVisibleLayers = new Set<MapLayer>()
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByText('Sélectionne au moins un type de lieu')).toBeDefined()
  })

  it('apply button is disabled when all POI layers are off', () => {
    mockVisibleLayers = new Set<MapLayer>()
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    const applyBtn = screen.getByText('Appliquer les filtres')
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows accommodation sub-type chips when accommodations layer is active locally', () => {
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    expect(screen.getByText(/Hôtel/)).toBeDefined()
    expect(screen.getByText(/Camping/)).toBeDefined()
  })

  it('hides accommodation sub-type chips when accommodations layer is toggled off', () => {
    mockVisibleLayers = new Set<MapLayer>()
    render(<LiveFiltersDrawer open={true} onOpenChange={() => {}} />)
    // After toggle off on open, sub-types should not be visible
    expect(screen.queryByText(/Refuge/)).toBeNull()
  })
})
