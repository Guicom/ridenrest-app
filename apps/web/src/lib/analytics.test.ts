import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackBookingClick } from './analytics'

describe('trackBookingClick', () => {
  let plausibleSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    plausibleSpy = vi.fn()
    window.plausible = plausibleSpy as typeof window.plausible
  })

  afterEach(() => {
    delete window.plausible
  })

  it('calls window.plausible with booking_click event and correct props', () => {
    trackBookingClick({
      source: 'booking.com',
      poi_type: 'hotel',
      page: 'map',
      user_tier: 'free',
    })

    expect(plausibleSpy).toHaveBeenCalledWith('booking_click', {
      props: {
        source: 'booking.com',
        poi_type: 'hotel',
        page: 'map',
        user_tier: 'free',
      },
    })
  })

  it('calls with airbnb source', () => {
    trackBookingClick({
      source: 'airbnb',
      poi_type: 'hostel',
      page: 'live',
      user_tier: 'pro',
    })

    expect(plausibleSpy).toHaveBeenCalledWith('booking_click', {
      props: {
        source: 'airbnb',
        poi_type: 'hostel',
        page: 'live',
        user_tier: 'pro',
      },
    })
  })

  it('is a no-op when window.plausible is not defined', () => {
    delete window.plausible
    expect(() =>
      trackBookingClick({
        source: 'booking.com',
        poi_type: 'none',
        page: 'map',
        user_tier: 'anonymous',
      }),
    ).not.toThrow()
  })

  it('sends none as poi_type when no specific type provided', () => {
    trackBookingClick({
      source: 'booking.com',
      poi_type: 'none',
      page: 'map',
      user_tier: 'anonymous',
    })

    expect(plausibleSpy).toHaveBeenCalledWith('booking_click', {
      props: expect.objectContaining({ poi_type: 'none', user_tier: 'anonymous' }),
    })
  })
})
