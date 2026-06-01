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
  profileOpen: false,
  onProfileToggle: vi.fn(),
  onProfileAutoOpen: vi.fn(),
  profileContent: <div data-testid="default-profile" />,
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
    expect(screen.getByTestId('elevation-gain-display').textContent).toContain('↑ 450 m')
  })

  it('renders elevation gain and loss on a single line (↑/↓)', () => {
    render(<LiveControls {...defaultProps} elevationGain={107} elevationLoss={59} />)
    const text = screen.getByTestId('elevation-gain-display').textContent
    expect(text).toContain('↑ 107 m')
    expect(text).toContain('↓ 59 m')
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

  // ── Story live-profile.1: collapsible PROFIL section ──────────

  describe('PROFIL collapsible section (Story live-profile.1)', () => {
    it('renders the PROFIL header with a toggle button', () => {
      render(<LiveControls {...defaultProps} />)
      expect(screen.getByText('PROFIL')).toBeDefined()
      expect(screen.getByTestId('btn-profile-toggle')).toBeDefined()
    })

    it('renders the separator between the profile and the rest (not under the PROFIL header)', () => {
      render(<LiveControls {...defaultProps} />)
      // The PROFIL header no longer carries the separator…
      expect(screen.getByTestId('btn-profile-toggle').className).not.toContain('border-b')
      // …it sits above the "MON HÔTEL DANS" block instead.
      expect(screen.getByTestId('profile-separator').className).toContain('border-t')
    })

    it('renders the chevron inside a light-green rounded circle', () => {
      render(<LiveControls {...defaultProps} />)
      const circle = screen.getByTestId('btn-profile-toggle').querySelector('span:last-child')
      expect(circle?.className).toContain('rounded-full')
      expect(circle?.className).toContain('bg-primary/10')
    })

    it('renders the metrics line after the slider in DOM order', () => {
      render(<LiveControls {...defaultProps} elevationGain={107} />)
      const slider = screen.getByTestId('slider-target')
      const metrics = screen.getByTestId('elevation-gain-display')
      // metrics appears after the slider → DOCUMENT_POSITION_PRECEDING (2) relative to metrics
      expect(slider.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('is collapsed by default — section height is h-0 (AC #2)', () => {
      render(<LiveControls {...defaultProps} profileOpen={false} />)
      const section = screen.getByTestId('profile-section')
      expect(section.className).toContain('h-0')
      expect(section.className).not.toContain('h-[80px]')
    })

    it('expands the section when profileOpen is true', () => {
      render(<LiveControls {...defaultProps} profileOpen={true} />)
      const section = screen.getByTestId('profile-section')
      expect(section.className).toContain('h-[80px]')
    })

    it('uses a smooth height transition (NFR-LP-004)', () => {
      render(<LiveControls {...defaultProps} />)
      const section = screen.getByTestId('profile-section')
      expect(section.className).toContain('transition-all')
      expect(section.className).toContain('duration-200')
    })

    it('renders profileContent inside the section', () => {
      render(
        <LiveControls
          {...defaultProps}
          profileContent={<div data-testid="profile-content-probe" />}
        />,
      )
      expect(screen.getByTestId('profile-content-probe')).toBeDefined()
    })

    it('toggle button has an aria-label reflecting state (AC #5)', () => {
      const { rerender } = render(<LiveControls {...defaultProps} profileOpen={false} />)
      expect(screen.getByTestId('btn-profile-toggle').getAttribute('aria-label')).toContain('Afficher')
      rerender(<LiveControls {...defaultProps} profileOpen={true} />)
      expect(screen.getByTestId('btn-profile-toggle').getAttribute('aria-label')).toContain('Masquer')
    })

    it('calls onProfileToggle when the chevron is clicked (AC #5)', () => {
      const onProfileToggle = vi.fn()
      render(<LiveControls {...defaultProps} onProfileToggle={onProfileToggle} />)
      fireEvent.click(screen.getByTestId('btn-profile-toggle'))
      expect(onProfileToggle).toHaveBeenCalled()
    })

    it('calls onProfileAutoOpen when the slider changes (AC #3)', () => {
      const onProfileAutoOpen = vi.fn()
      render(<LiveControls {...defaultProps} onProfileAutoOpen={onProfileAutoOpen} />)
      fireEvent.change(screen.getByTestId('slider-target'), { target: { value: '50' } })
      expect(onProfileAutoOpen).toHaveBeenCalled()
    })

    it('calls onProfileAutoOpen when btn-plus is clicked (AC #3)', () => {
      useLiveStore.setState({ targetAheadKm: 30 })
      const onProfileAutoOpen = vi.fn()
      render(<LiveControls {...defaultProps} onProfileAutoOpen={onProfileAutoOpen} />)
      fireEvent.click(screen.getByTestId('btn-plus'))
      expect(onProfileAutoOpen).toHaveBeenCalled()
    })

    it('calls onProfileAutoOpen when btn-minus is clicked (AC #3)', () => {
      useLiveStore.setState({ targetAheadKm: 30 })
      const onProfileAutoOpen = vi.fn()
      render(<LiveControls {...defaultProps} onProfileAutoOpen={onProfileAutoOpen} />)
      fireEvent.click(screen.getByTestId('btn-minus'))
      expect(onProfileAutoOpen).toHaveBeenCalled()
    })

    // ── Review findings (Code Review 2026-06-01) ──────────────────

    it('keeps the section collapsed and disables the toggle when there is no profileContent (Review P1)', () => {
      render(<LiveControls {...defaultProps} profileContent={undefined} profileOpen={true} />)
      const section = screen.getByTestId('profile-section')
      expect(section.className).toContain('h-0')
      expect(section.className).not.toContain('h-[80px]')
      const toggle = screen.getByTestId('btn-profile-toggle')
      expect(toggle.getAttribute('disabled')).not.toBeNull()
      // no expandable region announced when there is nothing to expand
      expect(toggle.getAttribute('aria-expanded')).toBeNull()
    })

    it('marks the collapsed section aria-hidden and reveals it when expanded (Review P2)', () => {
      const { rerender } = render(<LiveControls {...defaultProps} profileOpen={false} />)
      expect(screen.getByTestId('profile-section').getAttribute('aria-hidden')).toBe('true')
      rerender(<LiveControls {...defaultProps} profileOpen={true} />)
      expect(screen.getByTestId('profile-section').getAttribute('aria-hidden')).toBe('false')
    })

    it('does not render an orphan "·" separator when D+/D- are null but ETA exists (Review P3)', () => {
      render(<LiveControls {...defaultProps} elevationGain={null} elevationLoss={null} />)
      expect(screen.getByTestId('elevation-gain-display').textContent).toBe('—')
      // eta still shown (speed 15, target 30 → ~2h00) but without a leading separator
      expect(screen.getByTestId('eta-display').textContent).not.toContain('·')
    })

    it('exposes keyboard focus affordance on the toggle (Review P4)', () => {
      render(<LiveControls {...defaultProps} />)
      const circle = screen.getByTestId('btn-profile-toggle').querySelector('span:last-child')
      expect(circle?.className).toContain('group-focus-visible:bg-primary/15')
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
