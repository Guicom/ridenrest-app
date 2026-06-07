import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setAnalyticsClient } from './client'
import {
  hashAdventureId,
  trackBookingClick,
  trackGpxUploaded,
  trackMapOpened,
  trackPoiDetailOpened,
  trackPoiSearchTriggered,
  trackLiveModeActivated,
  trackLandingCtaClicked,
  trackSignupStarted,
  trackSignupCompleted,
  trackLoginCompleted,
} from './events'

describe('trackBookingClick', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    captureSpy = vi.fn()
    setAnalyticsClient({ capture: captureSpy })
  })

  afterEach(() => {
    setAnalyticsClient(null)
  })

  it('capture booking_click avec les bonnes props', () => {
    trackBookingClick({
      source: 'booking.com',
      poi_type: 'hotel',
      page: 'map',
      user_tier: 'free',
    })

    expect(captureSpy).toHaveBeenCalledWith('booking_click', {
      source: 'booking.com',
      poi_type: 'hotel',
      page: 'map',
      user_tier: 'free',
    })
  })

  it('capture avec source airbnb', () => {
    trackBookingClick({
      source: 'airbnb',
      poi_type: 'hostel',
      page: 'live',
      user_tier: 'pro',
    })

    expect(captureSpy).toHaveBeenCalledWith('booking_click', {
      source: 'airbnb',
      poi_type: 'hostel',
      page: 'live',
      user_tier: 'pro',
    })
  })

  it('no-op sans client injecté', () => {
    setAnalyticsClient(null)
    expect(() =>
      trackBookingClick({
        source: 'booking.com',
        poi_type: 'none',
        page: 'map',
        user_tier: 'anonymous',
      }),
    ).not.toThrow()
    expect(captureSpy).not.toHaveBeenCalled()
  })

  it('envoie none comme poi_type quand aucun type spécifique', () => {
    trackBookingClick({
      source: 'booking.com',
      poi_type: 'none',
      page: 'map',
      user_tier: 'anonymous',
    })

    expect(captureSpy).toHaveBeenCalledWith(
      'booking_click',
      expect.objectContaining({ poi_type: 'none', user_tier: 'anonymous' }),
    )
  })
})

describe('trackGpxUploaded', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    captureSpy = vi.fn()
    setAnalyticsClient({ capture: captureSpy })
  })

  afterEach(() => {
    setAnalyticsClient(null)
  })

  it('capture gpx_uploaded avec props stringifiées', () => {
    trackGpxUploaded({ segment_count: 3, total_km: 142.5 })

    expect(captureSpy).toHaveBeenCalledWith('gpx_uploaded', {
      segment_count: '3',
      total_km: '143',
    })
  })

  it('no-op sans client injecté', () => {
    setAnalyticsClient(null)
    expect(() => trackGpxUploaded({ segment_count: 1, total_km: 50 })).not.toThrow()
  })
})

describe('trackMapOpened', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    captureSpy = vi.fn()
    setAnalyticsClient({ capture: captureSpy })
  })

  afterEach(() => {
    setAnalyticsClient(null)
  })

  it('capture map_opened avec id aventure hashé', () => {
    trackMapOpened({ adventure_id_hash: 'abc12345' })

    expect(captureSpy).toHaveBeenCalledWith('map_opened', { adventure_id_hash: 'abc12345' })
  })

  it('no-op sans client injecté', () => {
    setAnalyticsClient(null)
    expect(() => trackMapOpened({ adventure_id_hash: 'abc12345' })).not.toThrow()
  })
})

describe('trackPoiSearchTriggered', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    captureSpy = vi.fn()
    setAnalyticsClient({ capture: captureSpy })
  })

  afterEach(() => {
    setAnalyticsClient(null)
  })

  it('capture poi_search_triggered avec props stringifiées', () => {
    trackPoiSearchTriggered({
      mode: 'planning',
      poi_categories: ['hotel', 'camp_site'],
      result_count: 12,
    })

    expect(captureSpy).toHaveBeenCalledWith('poi_search_triggered', {
      mode: 'planning',
      poi_categories: 'hotel,camp_site',
      result_count: '12',
    })
  })

  it('no-op sans client injecté', () => {
    setAnalyticsClient(null)
    expect(() =>
      trackPoiSearchTriggered({ mode: 'live', poi_categories: [], result_count: 0 }),
    ).not.toThrow()
  })
})

describe('trackPoiDetailOpened', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    captureSpy = vi.fn()
    setAnalyticsClient({ capture: captureSpy })
  })

  afterEach(() => {
    setAnalyticsClient(null)
  })

  it('capture poi_detail_opened', () => {
    trackPoiDetailOpened({ poi_type: 'hotel', source: 'google' })

    expect(captureSpy).toHaveBeenCalledWith('poi_detail_opened', {
      poi_type: 'hotel',
      source: 'google',
    })
  })

  it('fonctionne avec source overpass', () => {
    trackPoiDetailOpened({ poi_type: 'camp_site', source: 'overpass' })

    expect(captureSpy).toHaveBeenCalledWith('poi_detail_opened', {
      poi_type: 'camp_site',
      source: 'overpass',
    })
  })

  it('no-op sans client injecté', () => {
    setAnalyticsClient(null)
    expect(() => trackPoiDetailOpened({ poi_type: 'hotel', source: 'google' })).not.toThrow()
  })
})

describe('trackLiveModeActivated', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    captureSpy = vi.fn()
    setAnalyticsClient({ capture: captureSpy })
  })

  afterEach(() => {
    setAnalyticsClient(null)
  })

  it('capture live_mode_activated avec uniquement adventure_id_hash (zéro GPS)', () => {
    trackLiveModeActivated({ adventure_id_hash: 'abc12345' })

    expect(captureSpy).toHaveBeenCalledWith('live_mode_activated', {
      adventure_id_hash: 'abc12345',
    })
    // Garde RGPD : aucune autre prop que le hash
    const props = captureSpy.mock.calls[0][1]
    expect(Object.keys(props)).toEqual(['adventure_id_hash'])
  })

  it('no-op sans client injecté', () => {
    setAnalyticsClient(null)
    expect(() => trackLiveModeActivated({ adventure_id_hash: 'abc12345' })).not.toThrow()
  })
})

describe('funnel acquisition (landing → signup)', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    captureSpy = vi.fn()
    setAnalyticsClient({ capture: captureSpy })
  })

  afterEach(() => {
    setAnalyticsClient(null)
  })

  it('landing_cta_clicked avec placement et authenticated stringifié', () => {
    trackLandingCtaClicked({ placement: 'header', authenticated: false })

    expect(captureSpy).toHaveBeenCalledWith('landing_cta_clicked', {
      placement: 'header',
      authenticated: 'false',
    })
  })

  it('landing_cta_clicked depuis un feature step, session active', () => {
    trackLandingCtaClicked({ placement: 'feature_step_two', authenticated: true })

    expect(captureSpy).toHaveBeenCalledWith('landing_cta_clicked', {
      placement: 'feature_step_two',
      authenticated: 'true',
    })
  })

  it('signup_started avec method', () => {
    trackSignupStarted({ method: 'google' })
    expect(captureSpy).toHaveBeenCalledWith('signup_started', { method: 'google' })
  })

  it('signup_completed avec method', () => {
    trackSignupCompleted({ method: 'email' })
    expect(captureSpy).toHaveBeenCalledWith('signup_completed', { method: 'email' })
  })

  it('login_completed avec method', () => {
    trackLoginCompleted({ method: 'email' })
    expect(captureSpy).toHaveBeenCalledWith('login_completed', { method: 'email' })
  })

  it('no-op sans client injecté', () => {
    setAnalyticsClient(null)
    expect(() => {
      trackLandingCtaClicked({ placement: 'header', authenticated: false })
      trackSignupStarted({ method: 'email' })
      trackSignupCompleted({ method: 'email' })
      trackLoginCompleted({ method: 'email' })
    }).not.toThrow()
    expect(captureSpy).not.toHaveBeenCalled()
  })
})

describe('hashAdventureId', () => {
  it('retourne un hash stable pour la même entrée', () => {
    const hash1 = hashAdventureId('550e8400-e29b-41d4-a716-446655440000')
    const hash2 = hashAdventureId('550e8400-e29b-41d4-a716-446655440000')
    expect(hash1).toBe(hash2)
  })

  it('retourne des hashs différents pour des entrées différentes', () => {
    const hash1 = hashAdventureId('550e8400-e29b-41d4-a716-446655440000')
    const hash2 = hashAdventureId('660e8400-e29b-41d4-a716-446655440001')
    expect(hash1).not.toBe(hash2)
  })

  it('retourne une string de 8 caractères max', () => {
    const hash = hashAdventureId('550e8400-e29b-41d4-a716-446655440000')
    expect(hash.length).toBeLessThanOrEqual(8)
  })

  it('ne retourne pas l’UUID brut', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const hash = hashAdventureId(uuid)
    expect(hash).not.toContain(uuid)
    expect(hash).not.toContain('550e8400')
  })
})

describe('setAnalyticsClient (remplacement de client)', () => {
  it('le dernier client injecté gagne', () => {
    const first = vi.fn()
    const second = vi.fn()
    setAnalyticsClient({ capture: first })
    setAnalyticsClient({ capture: second })

    trackMapOpened({ adventure_id_hash: 'x' })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    setAnalyticsClient(null)
  })
})
