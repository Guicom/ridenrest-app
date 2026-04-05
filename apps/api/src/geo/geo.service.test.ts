import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { GeoService } from './geo.service.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import { GEOAPIFY_CACHE_TTL } from '@ridenrest/shared'

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
}

const mockRedisProvider: jest.Mocked<Pick<RedisProvider, 'getClient'>> = {
  getClient: jest.fn().mockReturnValue(mockRedis),
}

const mockConfigService = {
  get: jest.fn(),
}

describe('GeoService', () => {
  let service: GeoService

  beforeEach(async () => {
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue('OK')
    mockConfigService.get.mockReturnValue('test-api-key')

    const module = await Test.createTestingModule({
      providers: [
        GeoService,
        { provide: RedisProvider, useValue: mockRedisProvider },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    service = module.get<GeoService>(GeoService)
  })

  describe('reverseCity', () => {
    it('returns cached city on cache hit', async () => {
      mockRedis.get.mockResolvedValue('Pamplona')

      const result = await service.reverseCity(43.123, -1.456)

      expect(result).toBe('Pamplona')
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('returns null on cache hit with empty string (unknown area)', async () => {
      mockRedis.get.mockResolvedValue('')

      const result = await service.reverseCity(43.123, -1.456)

      expect(result).toBeNull()
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('normalizes cache key to 3 decimal places', async () => {
      mockRedis.get.mockResolvedValue('Toulouse')

      await service.reverseCity(43.1234, -1.4567)

      expect(mockRedis.get).toHaveBeenCalledWith('geo:city:43.123:-1.457')
    })

    it('two requests within ~44m use the same cache key', async () => {
      // 43.1230 and 43.1234 both round to 43.123 (toFixed(3))
      mockRedis.get.mockResolvedValue('Pamplona')

      await service.reverseCity(43.1230, -1.4560)
      await service.reverseCity(43.1234, -1.4562)

      expect(mockRedis.get).toHaveBeenCalledWith('geo:city:43.123:-1.456')
      expect(mockRedis.get).toHaveBeenCalledTimes(2)
      // Both calls use the same key
      const calls = mockRedis.get.mock.calls.map(([k]: [string]) => k)
      expect(calls[0]).toBe(calls[1])
    })

    it('calls Geoapify API and returns city on cache miss', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ city: 'Toulouse', town: undefined, village: undefined }],
        }),
      } as Response)

      const result = await service.reverseCity(43.6, 1.4)

      expect(result).toBe('Toulouse')
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('geoapify.com'))
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('geo:city:'),
        'Toulouse',
        'EX',
        GEOAPIFY_CACHE_TTL,
      )

      fetchSpy.mockRestore()
    })

    it('falls back to town when city absent', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ town: 'Saint-Girons' }] }),
      } as Response)

      const result = await service.reverseCity(42.98, 1.15)
      expect(result).toBe('Saint-Girons')
    })

    it('caches empty string and returns null when Geoapify returns no city', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{}] }),
      } as Response)

      const result = await service.reverseCity(43.0, 1.0)

      expect(result).toBeNull()
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('geo:city:'),
        '',
        'EX',
        GEOAPIFY_CACHE_TTL,
      )
    })

    it('returns null and does not cache on fetch error', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await service.reverseCity(43.0, 1.0)

      expect(result).toBeNull()
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('returns null on non-ok HTTP response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
      } as Response)

      const result = await service.reverseCity(43.0, 1.0)

      expect(result).toBeNull()
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('returns null for all requests when GEOAPIFY_API_KEY is empty', async () => {
      mockConfigService.get.mockReturnValue('')

      const module = await Test.createTestingModule({
        providers: [
          GeoService,
          { provide: RedisProvider, useValue: mockRedisProvider },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile()

      const serviceWithoutKey = module.get<GeoService>(GeoService)
      const result = await serviceWithoutKey.reverseCity(43.0, 1.0)

      expect(result).toBeNull()
      expect(mockRedis.get).not.toHaveBeenCalled()
    })
  })
})
