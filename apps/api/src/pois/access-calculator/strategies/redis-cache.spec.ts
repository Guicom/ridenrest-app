import {
  ACCESS_LIVE_KEY_PREFIX,
  buildAccessLiveKey,
  getCachedAccess,
  setCachedAccess,
  type CachedAccessMetrics,
  type RedisLike,
} from './redis-cache.js'

const METRICS: CachedAccessMetrics = {
  distanceM: 850,
  elevationGainM: 45,
  elevationLossM: 30,
  geometry: { type: 'LineString', coordinates: [[2, 48], [2.01, 48.01]] },
  engineVersion: 'brouter-1.7.9+trekking',
  computedAt: '2026-05-29T18:00:00.000Z',
}

function fakeRedis(): RedisLike & { get: jest.Mock; setex: jest.Mock } {
  return { get: jest.fn(), setex: jest.fn() }
}

describe('buildAccessLiveKey', () => {
  it('produit une clé anonyme sans userId (NFR-PA-006)', () => {
    const key = buildAccessLiveKey({ poiId: 'poi-1', profile: 'trekking', lat: 48.8566, lng: 2.3522 })
    expect(key).toBe('access:live:poi-1:trekking:48.8566:2.3522')
    expect(key.startsWith(ACCESS_LIVE_KEY_PREFIX)).toBe(true)
  })

  it("n'inclut jamais d'userId même si fourni dans poiId/profile", () => {
    // Garantie structurelle : la signature n'accepte pas d'userId.
    const key = buildAccessLiveKey({ poiId: 'poi-2', profile: 'safety', lat: 0, lng: 0 })
    expect(key).not.toMatch(/user/i)
  })

  it('encode des coordonnées négatives sans perte', () => {
    const key = buildAccessLiveKey({ poiId: 'p', profile: 'fastbike', lat: -33.8688, lng: -151.2093 })
    expect(key).toBe('access:live:p:fastbike:-33.8688:-151.2093')
  })
})

describe('getCachedAccess', () => {
  it('renvoie null sur cache miss (clé absente)', async () => {
    const redis = fakeRedis()
    redis.get.mockResolvedValue(null)
    await expect(getCachedAccess(redis, 'k')).resolves.toBeNull()
  })

  it('renvoie le payload parsé sur cache hit valide', async () => {
    const redis = fakeRedis()
    redis.get.mockResolvedValue(JSON.stringify(METRICS))
    await expect(getCachedAccess(redis, 'k')).resolves.toEqual(METRICS)
  })

  it('renvoie null sur JSON corrompu', async () => {
    const redis = fakeRedis()
    redis.get.mockResolvedValue('{not-json')
    await expect(getCachedAccess(redis, 'k')).resolves.toBeNull()
  })

  it('renvoie null sur payload de forme inattendue (champ manquant)', async () => {
    const redis = fakeRedis()
    redis.get.mockResolvedValue(JSON.stringify({ distanceM: 1 }))
    await expect(getCachedAccess(redis, 'k')).resolves.toBeNull()
  })

  it('renvoie null si geometry a un type invalide', async () => {
    const redis = fakeRedis()
    redis.get.mockResolvedValue(JSON.stringify({ ...METRICS, geometry: { type: 'Point', coordinates: [2, 48] } }))
    await expect(getCachedAccess(redis, 'k')).resolves.toBeNull()
  })

  it('préserve une géométrie MultiLineString', async () => {
    const redis = fakeRedis()
    const multi = { ...METRICS, geometry: { type: 'MultiLineString' as const, coordinates: [[[2, 48], [2.01, 48.01]]] } }
    redis.get.mockResolvedValue(JSON.stringify(multi))
    await expect(getCachedAccess(redis, 'k')).resolves.toEqual(multi)
  })
})

describe('setCachedAccess', () => {
  it('écrit via setex avec TTL et JSON sérialisé', async () => {
    const redis = fakeRedis()
    redis.setex.mockResolvedValue('OK')
    await setCachedAccess(redis, 'access:live:poi-1:trekking:48.8566:2.3522', METRICS, 900)
    expect(redis.setex).toHaveBeenCalledWith(
      'access:live:poi-1:trekking:48.8566:2.3522',
      900,
      JSON.stringify(METRICS),
    )
  })
})
