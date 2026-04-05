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
    it('returns cached city and postcode on cache hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ city: 'Pamplona', postcode: '31001' }))

      const result = await service.reverseCity(43.123, -1.456)

      expect(result).toEqual({ city: 'Pamplona', postcode: '31001' })
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('returns null city/postcode on cache hit with nulls', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ city: null, postcode: null }))

      const result = await service.reverseCity(43.123, -1.456)

      expect(result).toEqual({ city: null, postcode: null })
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('uses geo:cityv2: cache key with 3 decimal places', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ city: 'Toulouse', postcode: '31000' }))

      await service.reverseCity(43.1234, -1.4567)

      expect(mockRedis.get).toHaveBeenCalledWith('geo:cityv2:43.123:-1.457')
    })

    it('two requests within ~44m use the same cache key', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ city: 'Pamplona', postcode: '31001' }))

      await service.reverseCity(43.1230, -1.4560)
      await service.reverseCity(43.1234, -1.4562)

      expect(mockRedis.get).toHaveBeenCalledWith('geo:cityv2:43.123:-1.456')
      expect(mockRedis.get).toHaveBeenCalledTimes(2)
      const calls = mockRedis.get.mock.calls.map(([k]: [string]) => k)
      expect(calls[0]).toBe(calls[1])
    })

    it('calls Geoapify API and returns city + postcode on cache miss', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ city: 'Toulouse', postcode: '31000' }],
        }),
      } as Response)

      const result = await service.reverseCity(43.6, 1.4)

      expect(result).toEqual({ city: 'Toulouse', postcode: '31000' })
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('geoapify.com'))
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('geo:cityv2:'),
        JSON.stringify({ city: 'Toulouse', postcode: '31000' }),
        'EX',
        GEOAPIFY_CACHE_TTL,
      )

      fetchSpy.mockRestore()
    })

    it('falls back to town when city absent', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ town: 'Saint-Girons', postcode: '09200' }] }),
      } as Response)

      const result = await service.reverseCity(42.98, 1.15)
      expect(result).toEqual({ city: 'Saint-Girons', postcode: '09200' })
    })

    it('caches nulls and returns them when Geoapify returns no city/postcode', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{}] }),
      } as Response)

      const result = await service.reverseCity(43.0, 1.0)

      expect(result).toEqual({ city: null, postcode: null })
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('geo:cityv2:'),
        JSON.stringify({ city: null, postcode: null }),
        'EX',
        GEOAPIFY_CACHE_TTL,
      )
    })

    it('returns nulls and does not cache on fetch error', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await service.reverseCity(43.0, 1.0)

      expect(result).toEqual({ city: null, postcode: null })
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('returns nulls on non-ok HTTP response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
      } as Response)

      const result = await service.reverseCity(43.0, 1.0)

      expect(result).toEqual({ city: null, postcode: null })
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('returns nulls for all requests when GEOAPIFY_API_KEY is empty', async () => {
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

      expect(result).toEqual({ city: null, postcode: null })
      expect(mockRedis.get).not.toHaveBeenCalled()
    })
  })
})
