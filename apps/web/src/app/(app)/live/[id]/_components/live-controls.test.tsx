import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LiveControls, roundDownToStep } from './live-controls'
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
      min={props.min as number}
      max={props.max as number}
      step={props.step as number}
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
  elevationLoss: null,
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

  it('does not pass postcode/adminArea/country to SearchOnDropdown (Story 17.10)', () => {
    render(<LiveControls {...defaultProps} city="Pamplona" />)
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-city')).toBe('Pamplona')
    expect(el.getAttribute('data-postcode')).toBeNull()
  })

  // ── Story 16.24: +/- buttons ──────────────────────────────────

  describe('+/- buttons (Story 16.24)', () => {
    it('renders btn-minus and btn-plus in the DOM (AC #1)', () => {
      render(<LiveControls {...defaultProps} />)
      expect(screen.getByTestId('btn-minus')).toBeDefined()
      expect(screen.getByTestId('btn-plus')).toBeDefined()
    })

    it('clicking btn-minus decreases targetAheadKm by 5 (AC #2)', () => {
      useLiveStore.setState({ targetAheadKm: 30 })
      render(<LiveControls {...defaultProps} />)
      fireEvent.click(screen.getByTestId('btn-minus'))
      expect(useLiveStore.getState().targetAheadKm).toBe(25)
    })

    it('clicking btn-plus increases targetAheadKm by 5 (AC #3)', () => {
      useLiveStore.setState({ targetAheadKm: 30 })
      render(<LiveControls {...defaultProps} />)
      fireEvent.click(screen.getByTestId('btn-plus'))
      expect(useLiveStore.getState().targetAheadKm).toBe(35)
    })

    it('btn-minus is disabled when targetAheadKm is 5 (AC #4)', () => {
      useLiveStore.setState({ targetAheadKm: 5 })
      render(<LiveControls {...defaultProps} />)
      const btn = screen.getByTestId('btn-minus')
      expect(btn.getAttribute('disabled')).not.toBeNull()
      expect(btn.className).toContain('opacity-50')
    })

    it('btn-plus is disabled when targetAheadKm equals effectiveMax (AC #5)', () => {
      useLiveStore.setState({ targetAheadKm: 50 })
      render(<LiveControls {...defaultProps} maxAheadKm={50} />)
      const btn = screen.getByTestId('btn-plus')
      expect(btn.getAttribute('disabled')).not.toBeNull()
      expect(btn.className).toContain('opacity-50')
    })

    it('clicking disabled btn-minus does not change targetAheadKm (AC #4)', () => {
      useLiveStore.setState({ targetAheadKm: 5 })
      render(<LiveControls {...defaultProps} />)
      fireEvent.click(screen.getByTestId('btn-minus'))
      expect(useLiveStore.getState().targetAheadKm).toBe(5)
    })

    it('clicking disabled btn-plus does not change targetAheadKm (AC #5)', () => {
      useLiveStore.setState({ targetAheadKm: 50 })
      render(<LiveControls {...defaultProps} maxAheadKm={50} />)
      fireEvent.click(screen.getByTestId('btn-plus'))
      expect(useLiveStore.getState().targetAheadKm).toBe(50)
    })
  })

  // ── Story 16.20: Dynamic slider max ──────────────────────────

  describe('dynamic slider max (Story 16.20)', () => {
    it('slider max reflects remaining distance (AC #1)', () => {
      // total 200km, currentKm 50 → remaining 150, rounded to 150
      render(<LiveControls {...defaultProps} maxAheadKm={150} />)
      const slider = screen.getByTestId('slider-target')
      expect(slider.getAttribute('max')).toBe('150')
    })

    it('slider max rounds down to step=5 (AC #1)', () => {
      // remaining 143km → round down to 140
      render(<LiveControls {...defaultProps} maxAheadKm={143} />)
      const slider = screen.getByTestId('slider-target')
      expect(slider.getAttribute('max')).toBe('140')
    })

    it('slider max minimum is 5 even when remaining < 5 (AC #3)', () => {
      render(<LiveControls {...defaultProps} maxAheadKm={3} />)
      const slider = screen.getByTestId('slider-target')
      expect(slider.getAttribute('max')).toBe('5')
    })

    it('slider max defaults to 100 when maxAheadKm is undefined (AC #4)', () => {
      render(<LiveControls {...defaultProps} />)
      const slider = screen.getByTestId('slider-target')
      expect(slider.getAttribute('max')).toBe('100')
    })

    it('clamps targetAheadKm when max shrinks below current value (AC #2)', () => {
      // targetAheadKm=30 in store, new max=20 → should clamp to 20
      useLiveStore.setState({ targetAheadKm: 30 })
      render(<LiveControls {...defaultProps} maxAheadKm={22} />)
      // effectiveMax = roundDown(22, 5) = 20, and 30 > 20 → clamp
      expect(useLiveStore.getState().targetAheadKm).toBe(20)
    })

    it('does not clamp when targetAheadKm is within max', () => {
      useLiveStore.setState({ targetAheadKm: 30 })
      render(<LiveControls {...defaultProps} maxAheadKm={200} />)
      expect(useLiveStore.getState().targetAheadKm).toBe(30)
    })
  })
})

describe('roundDownToStep', () => {
  it('rounds 143 down to 140 with step 5', () => {
    expect(roundDownToStep(143, 5)).toBe(140)
  })
  it('keeps exact multiples unchanged', () => {
    expect(roundDownToStep(150, 5)).toBe(150)
  })
  it('rounds 9 down to 5 with step 5', () => {
    expect(roundDownToStep(9, 5)).toBe(5)
  })
  it('rounds 4 down to 0 with step 5', () => {
    expect(roundDownToStep(4, 5)).toBe(0)
  })
})
