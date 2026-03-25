import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PoiPopup } from './poi-popup'
import type { Poi } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'
import type maplibregl from 'maplibre-gl'

afterEach(cleanup)

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockDetails: {
  placeId: string
  displayName: string | null
  formattedAddress: string | null
  lat: number | null
  lng: number | null
  rating: number | null
  isOpenNow: boolean | null
  phone: string | null
  website: string | null
  types: string[]
} | null = null
let mockDetailsPending = false

vi.mock('@/hooks/use-poi-google-details', () => ({
  usePoiGoogleDetails: () => ({ details: mockDetails, isPending: mockDetailsPending }),
}))

const mockTrackBookingClick = vi.fn()
vi.mock('@/lib/api-client', () => ({
  trackBookingClick: (...args: unknown[]) => mockTrackBookingClick(...args),
}))

vi.mock('@ridenrest/gpx', () => ({
  computeElevationGain: () => 0,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PoiPopup', () => {
  let map: maplibregl.Map
  const onClose = vi.fn()

  beforeEach(() => {
    map = createMockMap()
    onClose.mockClear()
    mockTrackBookingClick.mockClear()
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

  it('shows type badge "Hébergement" for accommodation', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Hébergement')).toBeDefined()
  })

  it('shows type badge "Restauration" for restaurant', () => {
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
    expect(screen.getByText('km 10.0')).toBeDefined()
  })

  // ── Booking CTA ──────────────────────────────────────────────────────────────

  it('shows Booking CTA for accommodation', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Recherche sur Booking')).toBeDefined()
  })

  it('does NOT show Booking CTA for non-accommodation', () => {
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByText('Recherche sur Booking')).toBeNull()
  })

  it('Booking link contains latitude and longitude', () => {
    render(
      <PoiPopup
        poi={makeAccommodationPoi({ lat: 43.1, lng: 1.1 })}
        segments={[makeSegment()]}
        segmentId="seg-1"
        map={map}
        onClose={onClose}
      />,
    )
    const link = screen.getByText('Recherche sur Booking').closest('a')!
    expect(link.href).toContain('latitude=43.1')
    expect(link.href).toContain('longitude=1.1')
  })

  it('trackBookingClick called with externalId and booking_com on click', () => {
    render(
      <PoiPopup
        poi={makeAccommodationPoi({ externalId: 'ext-1' })}
        segments={[makeSegment()]}
        segmentId="seg-1"
        map={map}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Recherche sur Booking'))
    expect(mockTrackBookingClick).toHaveBeenCalledWith('ext-1', 'booking_com')
  })

  // ── Accommodation type selector ──────────────────────────────────────────────

  it('shows accommodation type chips for accommodation POI', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByRole('button', { name: /Hôtel/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Auberge/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Camping/ })).toBeDefined()
  })

  it('does NOT show accommodation chips for non-accommodation', () => {
    render(
      <PoiPopup poi={makeRestaurantPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByRole('button', { name: /🏨/ })).toBeNull()
  })

  it('type chip click updates Booking URL nflt filter', () => {
    render(
      <PoiPopup
        poi={makeAccommodationPoi({ lat: 43.1, lng: 1.1 })}
        segments={[makeSegment()]}
        segmentId="seg-1"
        map={map}
        onClose={onClose}
      />,
    )
    // Click "Auberge" chip (hostel)
    fireEvent.click(screen.getByRole('button', { name: /Auberge/ }))
    const link = screen.getByText('Recherche sur Booking').closest('a')!
    // hostel filter = ht_id%3D203
    expect(link.href).toContain('nflt=ht_id')
  })

  it('hotel chip has aria-pressed=true when hotel is selected', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi({ category: 'hotel' })} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    const hotelChip = screen.getByRole('button', { name: /Hôtel/ })
    expect(hotelChip.getAttribute('aria-pressed')).toBe('true')
  })

  // ── "Site officiel" button ───────────────────────────────────────────────────

  it('shows "Site officiel" for accommodation with website', () => {
    const poi = { ...makeAccommodationPoi(), rawData: { website: 'https://hotel-test.fr' } } as unknown as Poi
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('Site officiel')).toBeDefined()
    const link = screen.getByText('Site officiel').closest('a')!
    expect(link.href).toContain('https://hotel-test.fr')
  })

  it('does NOT show "Site officiel" for accommodation without website', () => {
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByText('Site officiel')).toBeNull()
  })

  it('does NOT show "Site officiel" for non-accommodation even with website', () => {
    const poi = { ...makeRestaurantPoi(), rawData: { website: 'https://resto-test.fr' } } as unknown as Poi
    render(
      <PoiPopup poi={poi} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.queryByText('Site officiel')).toBeNull()
  })

  it('"Site officiel" uses Google Details website when available', () => {
    mockDetails = {
      placeId: 'ChIJABC', displayName: null, formattedAddress: null, lat: null, lng: null,
      rating: null, isOpenNow: null, phone: null, website: 'https://google-website.fr', types: [],
    }
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    const link = screen.getByText('Site officiel').closest('a')!
    expect(link.href).toContain('https://google-website.fr')
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

  it('shows open status when isOpenNow=true', () => {
    mockDetails = {
      placeId: 'ChIJABC', displayName: null, formattedAddress: null, lat: null, lng: null,
      rating: null, isOpenNow: true, phone: null, website: null, types: [],
    }
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('✓ Ouvert')).toBeDefined()
  })

  it('shows closed status when isOpenNow=false', () => {
    mockDetails = {
      placeId: 'ChIJABC', displayName: null, formattedAddress: null, lat: null, lng: null,
      rating: null, isOpenNow: false, phone: null, website: null, types: [],
    }
    render(
      <PoiPopup poi={makeAccommodationPoi()} segments={[makeSegment()]} segmentId="seg-1" map={map} onClose={onClose} />,
    )
    expect(screen.getByText('✗ Fermé')).toBeDefined()
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
})
