import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  trackBookingClick,
  trackGpxUploaded,
  trackMapOpened,
  trackPoiSearchTriggered,
  trackPoiDetailOpened,
  hashAdventureId,
} from './analytics'

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

describe('trackGpxUploaded', () => {
  let plausibleSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    plausibleSpy = vi.fn()
    window.plausible = plausibleSpy as typeof window.plausible
  })

  afterEach(() => {
    delete window.plausible
  })

  it('calls window.plausible with gpx_uploaded event and stringified props', () => {
    trackGpxUploaded({ segment_count: 3, total_km: 142.5 })

    expect(plausibleSpy).toHaveBeenCalledWith('gpx_uploaded', {
      props: {
        segment_count: '3',
        total_km: '143',
      },
    })
  })

  it('is a no-op when window.plausible is not defined', () => {
    delete window.plausible
    expect(() => trackGpxUploaded({ segment_count: 1, total_km: 50 })).not.toThrow()
  })
})

describe('trackMapOpened', () => {
  let plausibleSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    plausibleSpy = vi.fn()
    window.plausible = plausibleSpy as typeof window.plausible
  })

  afterEach(() => {
    delete window.plausible
  })

  it('calls window.plausible with map_opened event and hashed adventure ID', () => {
    trackMapOpened({ adventure_id_hash: 'abc12345' })

    expect(plausibleSpy).toHaveBeenCalledWith('map_opened', {
      props: { adventure_id_hash: 'abc12345' },
    })
  })

  it('is a no-op when window.plausible is not defined', () => {
    delete window.plausible
    expect(() => trackMapOpened({ adventure_id_hash: 'abc12345' })).not.toThrow()
  })
})

describe('trackPoiSearchTriggered', () => {
  let plausibleSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    plausibleSpy = vi.fn()
    window.plausible = plausibleSpy as typeof window.plausible
  })

  afterEach(() => {
    delete window.plausible
  })

  it('calls window.plausible with poi_search_triggered and stringified props', () => {
    trackPoiSearchTriggered({
      mode: 'planning',
      poi_categories: ['hotel', 'camp_site'],
      result_count: 12,
    })

    expect(plausibleSpy).toHaveBeenCalledWith('poi_search_triggered', {
      props: {
        mode: 'planning',
        poi_categories: 'hotel,camp_site',
        result_count: '12',
      },
    })
  })

  it('is a no-op when window.plausible is not defined', () => {
    delete window.plausible
    expect(() =>
      trackPoiSearchTriggered({ mode: 'live', poi_categories: [], result_count: 0 }),
    ).not.toThrow()
  })
})

describe('trackPoiDetailOpened', () => {
  let plausibleSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    plausibleSpy = vi.fn()
    window.plausible = plausibleSpy as typeof window.plausible
  })

  afterEach(() => {
    delete window.plausible
  })

  it('calls window.plausible with poi_detail_opened event', () => {
    trackPoiDetailOpened({ poi_type: 'hotel', source: 'google' })

    expect(plausibleSpy).toHaveBeenCalledWith('poi_detail_opened', {
      props: { poi_type: 'hotel', source: 'google' },
    })
  })

  it('works with overpass source', () => {
    trackPoiDetailOpened({ poi_type: 'camp_site', source: 'overpass' })

    expect(plausibleSpy).toHaveBeenCalledWith('poi_detail_opened', {
      props: { poi_type: 'camp_site', source: 'overpass' },
    })
  })

  it('is a no-op when window.plausible is not defined', () => {
    delete window.plausible
    expect(() => trackPoiDetailOpened({ poi_type: 'hotel', source: 'google' })).not.toThrow()
  })
})

describe('hashAdventureId', () => {
  it('returns a consistent hash for the same input', () => {
    const hash1 = hashAdventureId('550e8400-e29b-41d4-a716-446655440000')
    const hash2 = hashAdventureId('550e8400-e29b-41d4-a716-446655440000')
    expect(hash1).toBe(hash2)
  })

  it('returns different hashes for different inputs', () => {
    const hash1 = hashAdventureId('550e8400-e29b-41d4-a716-446655440000')
    const hash2 = hashAdventureId('660e8400-e29b-41d4-a716-446655440001')
    expect(hash1).not.toBe(hash2)
  })

  it('returns a string of max 8 characters', () => {
    const hash = hashAdventureId('550e8400-e29b-41d4-a716-446655440000')
    expect(hash.length).toBeLessThanOrEqual(8)
  })

  it('does not return the raw UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const hash = hashAdventureId(uuid)
    expect(hash).not.toContain(uuid)
    expect(hash).not.toContain('550e8400')
  })
})
