import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LiveControls } from './live-controls'
import { useLiveStore } from '@/stores/live.store'

afterEach(cleanup)

vi.mock('@/components/shared/search-on-dropdown', () => ({
  SearchOnDropdown: ({ center, city }: { center: object | null; city?: string | null }) => (
    <div data-testid="search-on-dropdown" data-has-center={String(!!center)} data-city={city ?? ''} />
  ),
}))

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

const defaultProps = {
  onFiltersOpen: vi.fn(),
  onSearch: vi.fn(),
  activeFilterCount: 0,
  elevationGain: null,
  center: null,
}

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

  it('renders "MON HÔTEL DANS" label', () => {
    render(<LiveControls {...defaultProps} />)
    expect(screen.getByText('MON HÔTEL DANS')).toBeDefined()
  })

  it('renders targetAheadKm value in font-mono', () => {
    render(<LiveControls {...defaultProps} />)
    const el = screen.getByText('30 km')
    expect(el.className).toContain('font-mono')
  })

  it('renders ETA display', () => {
    render(<LiveControls {...defaultProps} />)
    // 30km at 15km/h = 2h00
    expect(screen.getByTestId('eta-display').textContent).toContain('~2h00')
  })

  it('renders elevation gain when provided', () => {
    render(<LiveControls {...defaultProps} elevationGain={450} />)
    expect(screen.getByTestId('elevation-gain-display').textContent).toContain('D+ 450m')
  })

  it('renders — when elevationGain is null', () => {
    render(<LiveControls {...defaultProps} />)
    expect(screen.getByTestId('elevation-gain-display').textContent).toBe('—')
  })

  it('renders distance slider', () => {
    render(<LiveControls {...defaultProps} />)
    expect(screen.getByTestId('slider-target')).toBeDefined()
  })

  it('renders RECHERCHER button, filters icon, and SearchOnDropdown', () => {
    render(<LiveControls {...defaultProps} />)
    expect(screen.getByTestId('btn-search')).toBeDefined()
    expect(screen.getByTestId('btn-filters')).toBeDefined()
    expect(screen.getByTestId('search-on-dropdown')).toBeDefined()
  })

  it('calls onSearch when RECHERCHER is clicked', () => {
    const onSearch = vi.fn()
    render(<LiveControls {...defaultProps} onSearch={onSearch} />)
    fireEvent.click(screen.getByTestId('btn-search'))
    expect(onSearch).toHaveBeenCalled()
  })

  it('calls onFiltersOpen when filters icon is clicked', () => {
    const onFiltersOpen = vi.fn()
    render(<LiveControls {...defaultProps} onFiltersOpen={onFiltersOpen} />)
    fireEvent.click(screen.getByTestId('btn-filters'))
    expect(onFiltersOpen).toHaveBeenCalled()
  })

  it('shows activeFilterCount badge when > 0', () => {
    render(<LiveControls {...defaultProps} activeFilterCount={3} />)
    expect(screen.getByText('3')).toBeDefined()
  })

  it('does not show badge when activeFilterCount is 0', () => {
    render(<LiveControls {...defaultProps} activeFilterCount={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('passes null center to SearchOnDropdown when center is null', () => {
    render(<LiveControls {...defaultProps} center={null} />)
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-has-center')).toBe('false')
  })

  it('passes center to SearchOnDropdown when center is provided', () => {
    render(<LiveControls {...defaultProps} center={{ lat: 43.5, lng: 1.4 }} />)
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-has-center')).toBe('true')
  })

  it('updates targetAheadKm when slider changes', () => {
    render(<LiveControls {...defaultProps} />)
    fireEvent.change(screen.getByTestId('slider-target'), { target: { value: '50' } })
    expect(useLiveStore.getState().targetAheadKm).toBe(50)
  })

  it('has desktop positioning classes (left-aligned, floating, all corners rounded, no shadow)', () => {
    render(<LiveControls {...defaultProps} />)
    const container = screen.getByTestId('live-controls')
    expect(container.className).toContain('lg:right-auto')
    expect(container.className).toContain('lg:w-[360px]')
    expect(container.className).toContain('lg:bottom-4')
    expect(container.className).toContain('lg:rounded-2xl')
    expect(container.className).toContain('lg:shadow-none')
  })

  it('does not render weather panel (weather is on map overlay)', () => {
    render(<LiveControls {...defaultProps} />)
    expect(screen.queryByTestId('live-weather-panel')).toBeNull()
  })

  it('passes city prop to SearchOnDropdown when provided', () => {
    render(<LiveControls {...defaultProps} city="Pamplona" />)
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-city')).toBe('Pamplona')
  })

  it('passes null city to SearchOnDropdown when city not provided', () => {
    render(<LiveControls {...defaultProps} />)
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-city')).toBe('')
  })
})
