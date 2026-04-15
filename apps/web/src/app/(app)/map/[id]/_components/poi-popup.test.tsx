import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PoiPopup } from './poi-popup'
import type { Poi } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'
import type maplibregl from 'maplibre-gl'

afterEach(cleanup)

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-reverse-city', () => ({
  useReverseCity: () => ({ city: null, isPending: false }),
}))

vi.mock('@/hooks/use-reverse-address', () => ({
  useReverseAddress: () => ({ address: null, isPending: false }),
}))

let mockDetails: {
  placeId: string
  displayName: string | null
  formattedAddress: string | null
  lat: number | null
  lng: number | null
  rating: number | null
  isOpenNow: boolean | null
  weekdayDescriptions: string[]
  periods: Array<{
    open:  { day: number; hour: number; minute: number }
    close: { day: number; hour: number; minute: number }
  }>
  phone: string | null
  website: string | null
  types: string[]
} | null = null
let mockDetailsPending = false

vi.mock('@/hooks/use-poi-google-details', () => ({
  usePoiGoogleDetails: () => ({ details: mockDetails, isPending: mockDetailsPending }),
}))

vi.mock('@ridenrest/gpx', () => ({
  computeElevationGain: () => 0,
  computeElevationLoss: () => 0,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

vi.mock('@/components/shared/search-on-dropdown', () => ({
  SearchOnDropdown: ({ center, city, className }: { center: { lat: number; lng: number } | null; city?: string | null; className?: string }) => (
    <div
      data-testid="search-on-dropdown"
      data-has-center={String(!!center)}
      data-lat={center?.lat ?? ''}
      data-lng={center?.lng ?? ''}
      data-city={city ?? ''}
      className={className}
    />
  ),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

const createMockMap = (): maplibregl.Map =>
  ({
    project: vi.fn().mockReturnValue({ x: 100, y: 200 }),
    on: vi.fn(),
    off: vi.fn(),
  }) as unknown as maplibregl.Map

const makeAccommodationPoi = (overrides?: Partial<Poi>): Poi => ({
  id: 'overpass-1',
  externalId: '1',
  source: 'overpass',
  category: 'hotel',
  name: 'Hôtel Test',
  lat: 43.1,
  lng: 1.1,
  distFromTraceM: 250,
  distAlongRouteKm: 10,
  ...overrides,
})

const makeRestaurantPoi = (overrides?: Partial<Poi>): Poi => ({
  id: 'overpass-2',
  externalId: '2',
  source: 'overpass',
  category: 'restaurant',
  name: 'Restaurant Test',
  lat: 43.2,
  lng: 1.2,
  distFromTraceM: 50,
  distAlongRouteKm: 15,
  ...overrides,
})

const makeSegment = (overrides?: Partial<MapSegmentData>): MapSegmentData => ({
  id: 'seg-1',
  name: 'S1',
  orderIndex: 0,
  cumulativeStartKm: 0,
  distanceKm: 50,
  parseStatus: 'done',
  waypoints: [],
  boundingBox: { minLat: 43.0, maxLat: 44.0, minLng: 1.0, maxLng: 2.0 },
  ...overrides,
})

const makeDetailsBase = (overrides = {}) => ({
  placeId: 'ChIJABC', displayName: null, formattedAddress: null, locality: null,
  postalCode: null, lat: null, lng: null, rating: null, isOpenNow: null,
  weekdayDescriptions: [], periods: [], phone: null, website: null, types: [],
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PoiPopup', () => {
  let map: maplibregl.Map
  const onClose = vi.fn()

  beforeEach(() => {
    map = createMockMap()
    onClose.mockClear()
    mockDetails = null
    mockDetailsPending = false
  })

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders POI name', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Hôtel Test')).toBeDefined()
  })

  it('shows category badge "Hôtel" for hotel (AC-1)', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi({ category: 'hotel' })} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    // Badge text (CATEGORY_LABELS.hotel = 'Hôtel')
    expect(screen.getAllByText('Hôtel').length).toBeGreaterThanOrEqual(1)
  })

  it('shows category badge "Restauration" for restaurant (AC-1)', () => {
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Restauration')).toBeDefined()
  })

  it('shows distance from trace in meters when < 1km', () => {
    render(
      <PoiPopup
        poi={makeAccommodationPoi({ distFromTraceM: 250 })}
        segments={[makeSegment()]}
        segmentId="seg-1"
        map={map}
        onClose={onClose}
      />,
    )
    expect(screen.getByText('250 m de la trace')).toBeDefined()
  })

  it('shows distance from trace in km when >= 1000m', () => {
    render(
      <PoiPopup
        poi={makeAccommodationPoi({ distFromTraceM: 1500 })}
        segments={[makeSegment()]}
        segmentId="seg-1"
        map={map}
        onClose={onClose}
      />,
    )
    expect(screen.getByText('1.5 km de la trace')).toBeDefined()
  })

  it('shows km on-trace value', () => {
    render(
      <PoiPopup
        poi={makeAccommodationPoi({ distAlongRouteKm: 10 })}
        segments={[makeSegment()]}
        segmentId="seg-1"
        map={map}
        onClose={onClose}
      />,
    )
    expect(screen.getByText('10.0 km')).toBeDefined()
  })

  // ── Navigation icon (AC-2) ───────────────────────────────────────────────────

  it('shows navigation link adjacent to name (AC-2)', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi({ lat: 43.1, lng: 1.1 })} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    const navLink = screen.getByRole('link', { name: /Naviguer vers/ })
    expect(navLink).toBeDefined()
    expect((navLink as HTMLAnchorElement).href).toContain('destination=43.1,1.1')
  })

  it('shows phone icon button when displayPhone available (AC-2)', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { phone: '+33612345678' } } as unknown as Poi
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByRole('link', { name: /Appeler/ })).toBeDefined()
  })

  it('does NOT show phone icon when no phone available (AC-2)', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByRole('link', { name: /Appeler/ })).toBeNull()
  })

  // ── displayName priority (AC-8) ──────────────────────────────────────────────

  it('displays Google displayName over poi.name (AC-8)', () => {
    mockDetails = makeDetailsBase({ displayName: 'Google Name Override' })
    render(
      <PoiPopup poi={makeAccommodationPoi({ name: 'OSM Name' })} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Google Name Override')).toBeDefined()
    expect(screen.queryByText('OSM Name')).toBeNull()
  })

  it('falls back to poi.name when Google displayName is null (AC-8)', () => {
    mockDetails = makeDetailsBase({ displayName: null })
    render(
      <PoiPopup poi={makeAccommodationPoi({ name: 'OSM Name' })} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('OSM Name')).toBeDefined()
  })

  // ── SearchOnDropdown CTA (AC-9) ─────────────────────────────────────────────

  it('shows SearchOnDropdown for accommodation (AC-9)', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByTestId('search-on-dropdown')).toBeDefined()
  })

  it('does NOT show SearchOnDropdown for non-accommodation (AC-9)', () => {
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByTestId('search-on-dropdown')).toBeNull()
  })

  it('SearchOnDropdown receives POI lat/lng as center (AC-9)', () => {
    render(
      <PoiPopup
        poi={makeAccommodationPoi({ lat: 43.1, lng: 1.1 })}
        segments={[makeSegment()]}
        segmentId="seg-1"
        map={map}
        onClose={onClose}
      />,
    )
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-has-center')).toBe('true')
    expect(el.getAttribute('data-lat')).toBe('43.1')
    expect(el.getAttribute('data-lng')).toBe('1.1')
  })

  it('SearchOnDropdown is full-width (AC-9)', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.className).toContain('w-full')
  })

  it('SearchOnDropdown appears before "Site officiel" when website available (AC-9)', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { website: 'https://hotel-test.fr' } } as unknown as Poi
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    const dropdown = screen.getByTestId('search-on-dropdown')
    const siteLink = screen.getByText('Site officiel').closest('a')!
    // dropdown should appear before site link in DOM order
    expect(dropdown.compareDocumentPosition(siteLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // ── No accommodation type chips ──────────────────────────────────────────────

  it('does NOT show accommodation type chips section', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByText("Type d'hébergement")).toBeNull()
  })

  // ── "Site officiel" button ───────────────────────────────────────────────────

  it('shows "Site officiel" for accommodation with website (AC-5)', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { website: 'https://hotel-test.fr' } } as unknown as Poi
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Site officiel')).toBeDefined()
    const link = screen.getByText('Site officiel').closest('a')!
    expect(link.href).toContain('https://hotel-test.fr')
  })

  it('does NOT show "Site officiel" for accommodation without website (AC-5)', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByText('Site officiel')).toBeNull()
  })

  it('shows "Site officiel" button for non-accommodation with website (AC-6)', () => {
    const poi = { ...makeRestaurantPoi(), rawData: { website: 'https://resto-test.fr' } } as unknown as Poi
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Site officiel')).toBeDefined()
    const link = screen.getByText('Site officiel').closest('a')!
    expect(link.href).toContain('https://resto-test.fr')
  })

  it('does NOT show "Site officiel" for non-accommodation without website (AC-6)', () => {
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByText('Site officiel')).toBeNull()
  })

  it('"Site officiel" uses Google Details website when available', () => {
    mockDetails = makeDetailsBase({ website: 'https://google-website.fr' })
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    const link = screen.getByText('Site officiel').closest('a')!
    expect(link.href).toContain('https://google-website.fr')
  })

  // ── Horaires (AC-4) ──────────────────────────────────────────────────────────

  it('shows open status for non-accommodation when isOpenNow=true (AC-4)', () => {
    mockDetails = makeDetailsBase({ isOpenNow: true })
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Ouvert')).toBeDefined()
  })

  it('shows closed status for non-accommodation when isOpenNow=false (AC-4)', () => {
    mockDetails = makeDetailsBase({ isOpenNow: false })
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Fermé')).toBeDefined()
  })

  it('does NOT show opening hours section for accommodation (AC-4)', () => {
    mockDetails = makeDetailsBase({ isOpenNow: true })
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByText('Ouvert')).toBeNull()
    expect(screen.queryByText('Fermé')).toBeNull()
  })

  it('expands weekday descriptions on click when available (AC-4)', () => {
    mockDetails = makeDetailsBase({
      isOpenNow: true,
      weekdayDescriptions: ['Lundi: 9:00 – 18:00', 'Mardi: 9:00 – 18:00'],
    })
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByText('Lundi: 9:00 – 18:00')).toBeNull()
    fireEvent.click(screen.getByText('Ouvert').closest('button')!)
    expect(screen.getByText('Lundi: 9:00 – 18:00')).toBeDefined()
  })

  // ── Close behavior ───────────────────────────────────────────────────────────

  it('X button calls onClose', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape key calls onClose', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  // ── Google enrichment ────────────────────────────────────────────────────────

  it('shows skeleton while details are loading', () => {
    mockDetailsPending = true
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  // ── Map interaction ──────────────────────────────────────────────────────────

  it('calls map.project with [lng, lat] to compute position', () => {
    render(
      <PoiPopup
        poi={makeAccommodationPoi({ lat: 43.5, lng: 2.5 })}
        segments={[makeSegment()]}
        segmentId="seg-1"
        map={map}
        onClose={onClose}
      />,
    )
    expect((map.project as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith([2.5, 43.5])
  })

  it('registers move and zoom listeners on mount', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect((map.on as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('move', expect.any(Function))
    expect((map.on as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('zoom', expect.any(Function))
  })

  it('removes map listeners on unmount', () => {
    const { unmount } = render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    unmount()
    expect((map.off as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('move', expect.any(Function))
    expect((map.off as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('zoom', expect.any(Function))
  })

  // ── City extraction for Booking.com CTA ────────────────────────────────────

  it('extracts city from Google locality (primary source)', () => {
    mockDetails = makeDetailsBase({ locality: 'Dieffenthal' })
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-city')).toBe('Dieffenthal')
  })

  it('falls back to OSM rawData addr:city when no Google locality', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { 'addr:city': 'Pamplona' } } as unknown as Poi
    mockDetails = makeDetailsBase({ locality: null })
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-city')).toBe('Pamplona')
  })

  it('Google locality takes priority over OSM rawData', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { 'addr:city': 'Pamplona' } } as unknown as Poi
    mockDetails = makeDetailsBase({ locality: 'Estella' })
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-city')).toBe('Estella')
  })

  it('falls back to OSM rawData addr:village when no Google locality', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { 'addr:village': 'Eylie' } } as unknown as Poi
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-city')).toBe('Eylie')
  })

  it('passes empty city while Google Places details are loading and no OSM city', () => {
    mockDetails = null
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-city')).toBe('')
  })

  it('passes empty city when locality is null and no OSM city', () => {
    mockDetails = makeDetailsBase({ locality: null })
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-city')).toBe('')
  })

  it('does not extract city for non-accommodation POIs', () => {
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByTestId('search-on-dropdown')).toBeNull()
  })

  // ── Story 17.10: postcode/adminArea/country no longer passed ──────────────

  it('does not pass postcode to SearchOnDropdown (Story 17.10)', () => {
    mockDetails = makeDetailsBase({ locality: 'Saint-Jean-de-Luz', postalCode: '64500' })
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByTestId('search-on-dropdown').getAttribute('data-postcode')).toBeNull()
  })
})
