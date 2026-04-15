import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PoiDetailSheet } from './poi-detail-sheet'
import type { Poi } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'

afterEach(cleanup)

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockSelectedPoiId: string | null = 'overpass-123'
const mockSetSelectedPoi = vi.fn()
vi.mock('@/stores/ui.store', () => ({
  useUIStore: () => ({
    selectedPoiId: mockSelectedPoiId,
    setSelectedPoi: mockSetSelectedPoi,
  }),
}))

let mockFromKm = 0
const mockSetSelectedPoiId = vi.fn()
vi.mock('@/stores/map.store', () => ({
  useMapStore: Object.assign(
    () => ({ fromKm: mockFromKm }),
    { getState: () => ({ setSelectedPoiId: mockSetSelectedPoiId }) },
  ),
}))

vi.mock('@/hooks/use-reverse-city', () => ({
  useReverseCity: () => ({ city: null, isPending: false }),
}))

let mockDetails: { placeId: string; displayName: string | null; formattedAddress: string | null; lat: number | null; lng: number | null; rating: number | null; isOpenNow: boolean | null; phone: string | null; website: string | null; types: string[] } | null = null
let mockDetailsPending = false
vi.mock('@/hooks/use-poi-google-details', () => ({
  usePoiGoogleDetails: () => ({ details: mockDetails, isPending: mockDetailsPending }),
}))

vi.mock('@/components/shared/search-on-dropdown', () => ({
  SearchOnDropdown: ({ center, city, className }: { center: { lat: number; lng: number } | null; city?: string | null; className?: string }) => (
    <div
      data-testid="search-on-dropdown"
      data-has-center={String(!!center)}
      data-city={city ?? ''}
      className={className}
    />
  ),
}))

vi.mock('@ridenrest/gpx', () => ({
  computeElevationGain: (points: Array<{ elevM?: number }>) => {
    if (points.length < 2) return 0
    let gain = 0
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].elevM ?? 0
      const curr = points[i].elevM ?? 0
      if (curr > prev) gain += curr - prev
    }
    return gain
  },
  computeElevationLoss: (points: Array<{ elevM?: number }>) => {
    if (points.length < 2) return 0
    let loss = 0
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].elevM ?? 0
      const curr = points[i].elevM ?? 0
      if (curr < prev) loss += prev - curr
    }
    return loss
  },
}))

// Vaul Drawer mock
vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children, open, onOpenChange }: { children: ReactNode; open: boolean; onOpenChange?: (open: boolean) => void }) => (
      <div data-testid="drawer" data-open={open} onClick={() => onOpenChange?.(false)}>{children}</div>
    ),
    Portal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Overlay: () => <div data-testid="drawer-overlay" />,
    Content: ({ children }: { children: ReactNode }) => <div data-testid="drawer-content">{children}</div>,
    Title: ({ children, className }: { children: ReactNode; className?: string }) => <h2 className={className}>{children}</h2>,
    Handle: () => <div data-testid="drawer-handle" />,
  },
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

// ── Test helpers ───────────────────────────────────────────────────────────────

const makeAccommodationPoi = (overrides?: Partial<Poi>): Poi => ({
  id: 'overpass-123',
  externalId: '123',
  source: 'overpass',
  category: 'hotel',
  name: 'Hôtel du Lac',
  lat: 43.1,
  lng: 1.1,
  distFromTraceM: 250,
  distAlongRouteKm: 10,
  ...overrides,
})

const makeRestaurantPoi = (overrides?: Partial<Poi>): Poi => ({
  id: 'overpass-456',
  externalId: '456',
  source: 'overpass',
  category: 'restaurant',
  name: 'La Bonne Table',
  lat: 43.2,
  lng: 1.2,
  distFromTraceM: 100,
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
  waypoints: [
    { lat: 43.0, lng: 1.0, ele: 100, distKm: 0 },
    { lat: 43.1, lng: 1.1, ele: 150, distKm: 5 },
    { lat: 43.2, lng: 1.2, ele: 200, distKm: 15 },
  ],
  boundingBox: { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 },
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PoiDetailSheet', () => {
  beforeEach(() => {
    mockSelectedPoiId = 'overpass-123'
    mockFromKm = 0
    mockDetails = null
    mockDetailsPending = false
    mockSetSelectedPoi.mockClear()
  })

  it('does not render when poi=null', () => {
    const { container } = render(
      <PoiDetailSheet poi={null} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders POI name', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getAllByText('Hôtel du Lac').length).toBeGreaterThan(0)
  })

  it('renders category icon for accommodation', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('🏨')).toBeDefined()
  })

  it('renders category icon for restaurant', () => {
    render(
      <PoiDetailSheet poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('🍽️')).toBeDefined()
  })

  it('shows km on-trace value', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi({ distAlongRouteKm: 10 })} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('km 10.0')).toBeDefined()
  })

  it('shows distance from trace in meters when < 1km', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi({ distFromTraceM: 250 })} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('250 m')).toBeDefined()
  })

  it('shows distance from trace in km when >= 1000m', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi({ distFromTraceM: 1500 })} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('1.5 km')).toBeDefined()
  })

  it('shows ~X min ETA with (à 15 km/h) hint', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi({ distAlongRouteKm: 15 })} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    // 15km at 15km/h = 1h00
    expect(screen.getByText('~1h00')).toBeDefined()
    expect(screen.getByText('(à 15 km/h)')).toBeDefined()
  })

  it('shows D+ when elevation data available on waypoints', () => {
    const segment = makeSegment({
      waypoints: [
        { lat: 43.0, lng: 1.0, ele: 100, distKm: 0 },
        { lat: 43.1, lng: 1.1, ele: 300, distKm: 10 },  // +200m gain
        { lat: 43.2, lng: 1.2, ele: 280, distKm: 15 },  // -20m (no gain)
      ],
    })
    render(
      <PoiDetailSheet poi={makeAccommodationPoi({ distAlongRouteKm: 15 })} segments={[segment]} segmentId="seg-1" />,
    )
    expect(screen.getByText('↑ 200 m')).toBeDefined()
  })

  // ── Type badge ──────────────────────────────────────────────────────────────

  it('shows "Hébergement" type badge for accommodation POI', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('Hébergement')).toBeDefined()
  })

  it('shows "Restauration" type badge for restaurant POI', () => {
    render(
      <PoiDetailSheet poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('Restauration')).toBeDefined()
  })

  // ── SearchOnDropdown CTA (accommodations) ─────���────────────────────────────

  it('shows SearchOnDropdown for accommodation POI', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByTestId('search-on-dropdown')).toBeDefined()
  })

  it('does NOT show SearchOnDropdown for restaurant POI', () => {
    render(
      <PoiDetailSheet poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.queryByTestId('search-on-dropdown')).toBeNull()
  })

  it('SearchOnDropdown receives city from OSM rawData', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { 'addr:city': 'Pamplona' } } as unknown as Poi
    render(
      <PoiDetailSheet poi={poi} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-city')).toBe('Pamplona')
  })

  it('SearchOnDropdown receives empty city when no city available', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-city')).toBe('')
  })

  it('SearchOnDropdown receives POI coordinates as center', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi({ lat: 43.1, lng: 1.1 })} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-has-center')).toBe('true')
  })

  // ── "Site officiel" ghost button ────────────────────────────────────────────

  it('shows "Site officiel" button when displayWebsite available for accommodation', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { website: 'https://hotel-test.fr' } } as unknown as Poi
    render(
      <PoiDetailSheet poi={poi} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('Site officiel')).toBeDefined()
    const link = screen.getByText('Site officiel').closest('a')!
    expect(link.href).toContain('https://hotel-test.fr')
  })

  it('does NOT show "Site officiel" button when displayWebsite is null for accommodation', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.queryByText('Site officiel')).toBeNull()
  })

  it('does NOT show "Site officiel" button for non-accommodation POI even if website available', () => {
    const poi = { ...makeRestaurantPoi(), rawData: { website: 'https://restaurant-test.fr' } } as unknown as Poi
    render(
      <PoiDetailSheet poi={poi} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.queryByText('Site officiel')).toBeNull()
  })

  it('"Site officiel" uses Google details website when available', () => {
    mockDetails = { placeId: 'ChIJABC', displayName: 'Hotel Test', formattedAddress: null, lat: null, lng: null, rating: null, isOpenNow: null, phone: null, website: 'https://google-website.fr', types: [] }
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    const link = screen.getByText('Site officiel').closest('a')!
    expect(link.href).toContain('https://google-website.fr')
  })

  // ── Removed elements (regression guards) ───────────────────────────────────

  it('does NOT show "Lien partenaire" label', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.queryByText('Lien partenaire')).toBeNull()
  })

  it('does NOT show Hotels.com button', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.queryByText(/Hotels\.com/i)).toBeNull()
  })

  // ── Google enrichment ───────────────────────────────────────────────────────

  it('shows <Skeleton /> when detailsPending=true', () => {
    mockDetailsPending = true
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('shows open/closed status when details loaded', () => {
    mockDetails = { placeId: 'ChIJABC', displayName: 'Hotel Test', formattedAddress: null, lat: null, lng: null, rating: null, isOpenNow: true, phone: null, website: null, types: [] }
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('✓ Ouvert maintenant')).toBeDefined()
  })

  it('shows closed status when isOpenNow=false', () => {
    mockDetails = { placeId: 'ChIJABC', displayName: null, formattedAddress: null, lat: null, lng: null, rating: null, isOpenNow: false, phone: null, website: null, types: [] }
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('✗ Fermé')).toBeDefined()
  })

  it('setSelectedPoi(null) called when Drawer closed', () => {
    render(
      <PoiDetailSheet poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    // Simulate drawer close via onOpenChange(false)
    fireEvent.click(screen.getByTestId('drawer'))
    expect(mockSetSelectedPoi).toHaveBeenCalledWith(null)
  })

  it('shows OSM rawData phone when Google details not available', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { phone: '+33 4 78 00 00 00' } } as unknown as Poi
    render(
      <PoiDetailSheet poi={poi} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('+33 4 78 00 00 00')).toBeDefined()
  })

  it('Google details phone takes precedence over OSM rawData', () => {
    mockDetails = { placeId: 'ChIJABC', displayName: null, formattedAddress: null, lat: null, lng: null, rating: null, isOpenNow: null, phone: '+33 4 99 99 99 99', website: null, types: [] }
    const poi = { ...makeAccommodationPoi(), rawData: { phone: '+33 4 00 00 00 00' } } as unknown as Poi
    render(
      <PoiDetailSheet poi={poi} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    expect(screen.getByText('+33 4 99 99 99 99')).toBeDefined()
    expect(screen.queryByText('+33 4 00 00 00 00')).toBeNull()
  })

  // ── Story 17.10: postcode/adminArea/country no longer passed ──────────────

  it('does not pass postcode to SearchOnDropdown (Story 17.10)', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { 'addr:city': 'Pamplona', 'addr:postcode': '31001' } } as unknown as Poi
    render(
      <PoiDetailSheet poi={poi} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    const el = screen.getByTestId('search-on-dropdown')
    expect(el.getAttribute('data-postcode')).toBeNull()
  })

  it('shows "Site officiel" using OSM rawData website when Google details not available', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { website: 'https://hotel-test.fr' } } as unknown as Poi
    render(
      <PoiDetailSheet poi={poi} segments={[makeSegment()]} segmentId="seg-1" />,
    )
    // Accommodation: website shown via "Site officiel" ghost button, not raw URL text
    const link = screen.getByText('Site officiel').closest('a')!
    expect(link.href).toContain('https://hotel-test.fr')
  })
})
