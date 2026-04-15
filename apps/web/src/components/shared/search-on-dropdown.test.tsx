import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SearchOnDropdown } from './search-on-dropdown'

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ data: { overpassEnabled: false, tier: 'free' } }),
}))

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({ data: { user: { id: 'u1', email: 'test@test.com' } } }),
}))

vi.mock('@/lib/analytics', () => ({
  trackBookingClick: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

const center = { lat: 43.5, lng: 1.4 }

describe('SearchOnDropdown', () => {
  it('renders trigger button', () => {
    render(<SearchOnDropdown center={center} />)
    expect(screen.getByTestId('search-on-trigger')).toBeDefined()
  })

  it('dropdown is closed by default', () => {
    render(<SearchOnDropdown center={center} />)
    expect(screen.queryByTestId('search-on-menu')).toBeNull()
  })

  it('clicking trigger opens dropdown', () => {
    render(<SearchOnDropdown center={center} />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    expect(screen.getByTestId('search-on-menu')).toBeDefined()
  })

  it('clicking trigger again closes dropdown', () => {
    render(<SearchOnDropdown center={center} />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    expect(screen.queryByTestId('search-on-menu')).toBeNull()
  })

  it('shows Booking.com and Airbnb links when open with city', () => {
    render(<SearchOnDropdown center={center} city="Toulouse" />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    expect(screen.getByTestId('search-on-booking')).toBeDefined()
    expect(screen.getByTestId('search-on-airbnb')).toBeDefined()
  })

  it('Booking.com link always uses coordinates when center available', () => {
    render(<SearchOnDropdown center={center} city="Pamplona" />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    const link = screen.getByTestId('search-on-booking') as HTMLAnchorElement
    expect(link.href).toContain('latitude=43.5')
    expect(link.href).toContain('longitude=1.4')
    expect(link.href).toContain('dest_type=latlong')
    expect(link.href).not.toContain('ss=')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('Booking.com link falls back to city name when no center', () => {
    render(<SearchOnDropdown center={null} city="Pamplona" />)
    // trigger is disabled when center is null, so we test the URL is null (no link rendered)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    expect(screen.queryByTestId('search-on-menu')).toBeNull()
  })

  it('Airbnb link has correct bbox URL', () => {
    render(<SearchOnDropdown center={center} />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    const link = screen.getByTestId('search-on-airbnb') as HTMLAnchorElement
    expect(link.href).toContain('airbnb.com/s/homes')
    expect(link.href).toContain('ne_lat=43.7')   // 43.5 + 0.2
    expect(link.href).toContain('sw_lat=43.3')   // 43.5 - 0.2
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('clicking Airbnb link closes the dropdown', () => {
    render(<SearchOnDropdown center={center} />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    fireEvent.click(screen.getByTestId('search-on-airbnb'))
    expect(screen.queryByTestId('search-on-menu')).toBeNull()
  })

  it('clicking Booking link closes the dropdown', () => {
    render(<SearchOnDropdown center={center} city="Pamplona" />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    fireEvent.click(screen.getByTestId('search-on-booking'))
    expect(screen.queryByTestId('search-on-menu')).toBeNull()
  })

  it('trigger is disabled when center is null', () => {
    render(<SearchOnDropdown center={null} />)
    expect(screen.getByTestId('search-on-trigger')).toHaveProperty('disabled', true)
  })

  it('dropdown does not open when center is null', () => {
    render(<SearchOnDropdown center={null} />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    expect(screen.queryByTestId('search-on-menu')).toBeNull()
  })

  it('outline variant shows "Rechercher sur" text', () => {
    render(<SearchOnDropdown center={center} variant="outline" />)
    expect(screen.getByText('Rechercher sur')).toBeDefined()
  })

  it('action variant shows "RECHERCHER SUR" text', () => {
    render(<SearchOnDropdown center={center} variant="action" />)
    expect(screen.getByText('RECHERCHER SUR')).toBeDefined()
  })

  it('trigger aria-expanded reflects open state', () => {
    render(<SearchOnDropdown center={center} />)
    const trigger = screen.getByTestId('search-on-trigger')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('outside click closes dropdown', () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <SearchOnDropdown center={center} />
      </div>,
    )
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    expect(screen.getByTestId('search-on-menu')).toBeDefined()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByTestId('search-on-menu')).toBeNull()
  })

  // ── Analytics tracking (Story 15.2) ────────────────────────────────────────

  it('fires booking_click event with booking.com source on Booking link click', async () => {
    const { trackBookingClick } = await import('@/lib/analytics')
    render(<SearchOnDropdown center={center} city="Toulouse" page="map" poiType="hotel" />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    fireEvent.click(screen.getByTestId('search-on-booking'))
    expect(trackBookingClick).toHaveBeenCalledWith({
      source: 'booking.com',
      poi_type: 'hotel',
      page: 'map',
      user_tier: 'free',
    })
  })

  it('fires booking_click event with airbnb source on Airbnb link click', async () => {
    const { trackBookingClick } = await import('@/lib/analytics')
    render(<SearchOnDropdown center={center} page="live" poiType="camp_site" />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    fireEvent.click(screen.getByTestId('search-on-airbnb'))
    expect(trackBookingClick).toHaveBeenCalledWith({
      source: 'airbnb',
      poi_type: 'camp_site',
      page: 'live',
      user_tier: 'free',
    })
  })

  it('uses none as poi_type when poiType prop not provided', async () => {
    const { trackBookingClick } = await import('@/lib/analytics')
    render(<SearchOnDropdown center={center} page="map" />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    fireEvent.click(screen.getByTestId('search-on-airbnb'))
    expect(trackBookingClick).toHaveBeenCalledWith(
      expect.objectContaining({ poi_type: 'none' }),
    )
  })

  it('defaults page to map when not specified', async () => {
    const { trackBookingClick } = await import('@/lib/analytics')
    render(<SearchOnDropdown center={center} />)
    fireEvent.click(screen.getByTestId('search-on-trigger'))
    fireEvent.click(screen.getByTestId('search-on-airbnb'))
    expect(trackBookingClick).toHaveBeenCalledWith(
      expect.objectContaining({ page: 'map' }),
    )
  })
})
