// Tests for StravaService
import { NotFoundException } from '@nestjs/common'
import { StravaService } from './strava.service.js'
import type { SegmentsService } from '../segments/segments.service.js'
import type { AdventuresService } from '../adventures/adventures.service.js'
import type { RedisProvider } from '../common/providers/redis.provider.js'

// Mock @ridenrest/database
// Must use var (not const/let) so Jest hoisting doesn't cause TDZ:
// jest.mock() factories are hoisted before const/let initializations.
// The factory assigns mockDb so it's ready before any test code runs.
// eslint-disable-next-line no-var
var mockDb: { select: jest.Mock; update: jest.Mock; from: jest.Mock; where: jest.Mock; set: jest.Mock }

jest.mock('@ridenrest/database', () => {
  mockDb = { select: jest.fn(), update: jest.fn(), from: jest.fn(), where: jest.fn(), set: jest.fn() }
  return { db: mockDb, account: {} }
})

// Mock drizzle-orm
jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  eq: jest.fn(),
}))

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
}

const mockGetClient = jest.fn().mockReturnValue(mockRedisClient)
const mockCreateSegment = jest.fn()
const mockVerifyOwnership = jest.fn()

const mockRedisProvider = {
  getClient: mockGetClient,
} as unknown as RedisProvider

const mockSegmentsService = {
  createSegment: mockCreateSegment,
} as unknown as SegmentsService

const mockAdventuresService = {
  verifyOwnership: mockVerifyOwnership,
} as unknown as AdventuresService

const service = new StravaService(
  mockSegmentsService,
  mockAdventuresService,
  mockRedisProvider,
)

// Helper to set up DB mock chain for account queries
function mockDbSelectAccount(result: object[]) {
  mockDb.select.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(result),
    }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetClient.mockReturnValue(mockRedisClient)
})

describe('listRoutes', () => {
  it('3.1 — returns cached routes when Redis HIT (no Strava API call)', async () => {
    const cachedRoutes = [{ id: '123', name: 'Col du Tourmalet', distanceKm: 45.2, elevationGainM: 1200 }]
    mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedRoutes))

    const result = await service.listRoutes('user-1')

    expect(result).toEqual(cachedRoutes)
    expect(mockRedisClient.get).toHaveBeenCalledWith('strava:routes:v2:user-1:page:1')
    // No DB calls needed when cache HIT
  })

  it('3.1b — uses page-scoped cache key for page 2', async () => {
    const cachedRoutes = [{ id: '200', name: 'Route Page 2', distanceKm: 30, elevationGainM: 200 }]
    mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedRoutes))

    const result = await service.listRoutes('user-1', 2)

    expect(result).toEqual(cachedRoutes)
    expect(mockRedisClient.get).toHaveBeenCalledWith('strava:routes:v2:user-1:page:2')
  })

  it('3.3 — throws NotFoundException when user has no Strava token in DB', async () => {
    mockRedisClient.get.mockResolvedValue(null)  // cache MISS
    mockDbSelectAccount([])  // No account found

    await expect(service.listRoutes('user-1')).rejects.toThrow(NotFoundException)
  })
})

describe('listRoutes — cache MISS', () => {
  beforeEach(() => {
    mockRedisClient.get.mockResolvedValue(null)
    mockRedisClient.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1)
    mockRedisClient.expire.mockResolvedValue(1)
    mockRedisClient.set.mockResolvedValue('OK')
  })

  it('3.2 — fetches from Strava and writes to Redis on cache MISS', async () => {
    const validAccount = {
      accessToken: 'valid-token',
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),  // expires in 1h
      refreshToken: 'refresh-token',
      id: 'acct-1',
    }
    const athleteAccount = { accountId: '12345' }

    // First call: getValidAccessToken
    mockDbSelectAccount([validAccount])
    // Second call: getAthleteId
    mockDbSelectAccount([athleteAccount])

    const stravaRoutes = [{ id: 100, name: 'Route Test', distance: 50000, elevation_gain: 800 }]
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(stravaRoutes)),
    } as unknown as Response)

    const result = await service.listRoutes('user-1')

    expect(result).toEqual([{ id: '100', name: 'Route Test', distanceKm: 50, elevationGainM: 800 }])
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'strava:routes:v2:user-1:page:1',
      JSON.stringify(result),
      'EX',
      3600,
    )
  })

  it('3.2b — fetches page 2 from Strava with correct URL and cache key', async () => {
    const validAccount = {
      accessToken: 'valid-token',
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      refreshToken: 'refresh-token',
      id: 'acct-1',
    }
    const athleteAccount = { accountId: '12345' }

    mockDbSelectAccount([validAccount])
    mockDbSelectAccount([athleteAccount])

    const stravaRoutes = [{ id: 200, name: 'Page 2 Route', distance: 30000, elevation_gain: 400 }]
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(stravaRoutes)),
    } as unknown as Response)

    const result = await service.listRoutes('user-1', 2)

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('?per_page=30&page=2'),
      expect.any(Object),
    )
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'strava:routes:v2:user-1:page:2',
      JSON.stringify(result),
      'EX',
      3600,
    )
  })
})

describe('importRoute', () => {
  it('3.4 — calls verifyOwnership, fetches GPX, calls createSegment, returns segment with source: strava', async () => {
    mockVerifyOwnership.mockResolvedValue(undefined)
    mockRedisClient.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1)
    mockRedisClient.expire.mockResolvedValue(1)

    const validAccount = {
      accessToken: 'valid-token',
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      refreshToken: 'refresh-token',
      id: 'acct-1',
    }
    mockDbSelectAccount([validAccount])

    const cachedRoutes = [{ id: '456', name: 'Transcantabrique', distanceKm: 80, elevationGainM: 2000 }]
    mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedRoutes))

    const gpxBuffer = Buffer.from('<gpx/>')
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(gpxBuffer.buffer),
    } as unknown as Response)

    const expectedSegment = {
      id: 'seg-1',
      adventureId: 'adv-1',
      name: 'Transcantabrique',
      source: 'strava',
      parseStatus: 'pending',
    }
    mockCreateSegment.mockResolvedValue(expectedSegment)

    const result = await service.importRoute('user-1', '456', 'adv-1')

    expect(mockVerifyOwnership).toHaveBeenCalledWith('adv-1', 'user-1')
    expect(mockCreateSegment).toHaveBeenCalledWith(
      'adv-1', 'user-1',
      expect.objectContaining({ originalname: 'Transcantabrique.gpx', mimetype: 'application/gpx+xml' }),
      'Transcantabrique',
      'strava',
    )
    expect(result).toEqual(expectedSegment)
  })
})

describe('checkAndIncrementRateLimit (via listRoutes)', () => {
  beforeEach(() => {
    mockRedisClient.get.mockResolvedValue(null)
  })

  it('3.5 — throws 429 when 15min counter >= 100', async () => {
    const validAccount = {
      accessToken: 'valid-token',
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      refreshToken: 'refresh-token',
      id: 'acct-1',
    }
    mockDbSelectAccount([validAccount])

    // 15min counter at 100 (at limit — should block per AC #4)
    mockRedisClient.incr.mockResolvedValueOnce(100)

    await expect(service.listRoutes('user-1')).rejects.toMatchObject({ status: 429 })
  })

  it('3.6 — throws 429 when daily counter >= 1000', async () => {
    const validAccount = {
      accessToken: 'valid-token',
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      refreshToken: 'refresh-token',
      id: 'acct-1',
    }
    mockDbSelectAccount([validAccount])

    // 15min counter OK, daily at limit (1000 = block per AC #5)
    mockRedisClient.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1000)
    mockRedisClient.expire.mockResolvedValue(1)

    await expect(service.listRoutes('user-1')).rejects.toMatchObject({ status: 429 })
  })
})

describe('getValidAccessToken', () => {
  beforeEach(() => {
    mockRedisClient.get.mockResolvedValue(null)
    mockRedisClient.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1)
    mockRedisClient.expire.mockResolvedValue(1)
    mockRedisClient.set.mockResolvedValue('OK')
  })

  it('3.7 — returns current token when not expired', async () => {
    const validAccount = {
      accessToken: 'still-valid-token',
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),  // 1h from now
      refreshToken: 'refresh-token',
      id: 'acct-1',
    }
    mockDbSelectAccount([validAccount])
    mockDbSelectAccount([{ accountId: '999' }])  // getAthleteId

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify([])),
    } as unknown as Response)

    await service.listRoutes('user-1')

    // fetch should be called with 'still-valid-token' (no refresh)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/athletes/'),
      expect.objectContaining({ headers: { Authorization: 'Bearer still-valid-token' } }),
    )
  })

  it('3.8 — refreshes and updates DB when token expired', async () => {
    const expiredAccount = {
      accessToken: 'expired-token',
      accessTokenExpiresAt: new Date(Date.now() - 1000),  // expired
      refreshToken: 'refresh-token',
      id: 'acct-1',
    }
    mockDbSelectAccount([expiredAccount])
    mockDbSelectAccount([{ accountId: '999' }])  // getAthleteId

    mockDb.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    })

    const refreshResponse = {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(refreshResponse),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([])),
      } as unknown as Response)

    await service.listRoutes('user-1')

    // First fetch should be to strava.com/oauth/token (refresh)
    expect(global.fetch).toHaveBeenNthCalledWith(1,
      'https://www.strava.com/oauth/token',
      expect.objectContaining({ method: 'POST' }),
    )
    // Second fetch uses new-token
    expect(global.fetch).toHaveBeenNthCalledWith(2,
      expect.stringContaining('/athletes/'),
      expect.objectContaining({ headers: { Authorization: 'Bearer new-token' } }),
    )
  })
})
