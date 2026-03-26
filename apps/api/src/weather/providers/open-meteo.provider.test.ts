import { Test, TestingModule } from '@nestjs/testing'
import { OpenMeteoProvider } from './open-meteo.provider.js'
import { RedisProvider } from '../../common/providers/redis.provider.js'

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
}

const mockRedisProvider = {
  getClient: jest.fn().mockReturnValue(mockRedis),
}

const SAMPLE_RESPONSE = {
  hourly: {
    time: ['2026-03-22T10:00', '2026-03-22T11:00', '2026-03-22T12:00'],
    temperature_2m: [12.5, 14.0, 15.3],
    wind_speed_10m: [20.0, 22.0, 18.0],
    wind_direction_10m: [270, 280, 260],
    precipitation_probability: [10, 5, 0],
    weather_code: [2, 1, 0],
  },
}

describe('OpenMeteoProvider', () => {
  let provider: OpenMeteoProvider

  beforeEach(async () => {
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue('OK')
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenMeteoProvider,
        { provide: RedisProvider, useValue: mockRedisProvider },
      ],
    }).compile()

    provider = module.get<OpenMeteoProvider>(OpenMeteoProvider)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('fetchHourlyForecast', () => {
    it('returns weather data for a matching hour', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(SAMPLE_RESPONSE),
      } as Response)

      const result = await provider.fetchHourlyForecast(48.8566, 2.3522, new Date('2026-03-22T11:00:00Z'))

      expect(result).toEqual({
        temperatureC: 14.0,
        windSpeedKmh: 22.0,
        windDirection: 280,
        precipitationProbability: 5,
        weatherCode: 1,
      })
      expect(mockRedis.set).toHaveBeenCalledWith(
        'weather:48.8566:2.3522:2026-03-22:11',
        JSON.stringify(result),
        'EX',
        3600,
      )
    })

    it('returns null when hour not found in response (beyond horizon)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(SAMPLE_RESPONSE),
      } as Response)

      const result = await provider.fetchHourlyForecast(48.8566, 2.3522, new Date('2026-04-10T08:00:00Z'))

      expect(result).toBeNull()
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('weather:') as string,
        'null',
        'EX',
        3600,
      )
    })

    it('returns cached value from Redis without calling fetch', async () => {
      const cachedData = { temperatureC: 10, windSpeedKmh: 15, windDirection: 90, precipitationProbability: 20, weatherCode: 3 }
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData))

      const fetchSpy = jest.spyOn(global, 'fetch')
      const result = await provider.fetchHourlyForecast(48.8566, 2.3522, new Date('2026-03-22T10:00:00Z'))

      expect(result).toEqual(cachedData)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('returns cached null from Redis (beyond horizon was cached)', async () => {
      mockRedis.get.mockResolvedValueOnce('null')

      const fetchSpy = jest.spyOn(global, 'fetch')
      const result = await provider.fetchHourlyForecast(48.8566, 2.3522, new Date('2026-03-22T10:00:00Z'))

      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('returns null and does not throw when fetch fails', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'))

      const result = await provider.fetchHourlyForecast(48.8566, 2.3522, new Date('2026-03-22T10:00:00Z'))

      expect(result).toBeNull()
    })

    it('returns null when Open-Meteo returns non-OK status', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
      } as Response)

      const result = await provider.fetchHourlyForecast(48.8566, 2.3522, new Date('2026-03-22T10:00:00Z'))

      expect(result).toBeNull()
    })

    it('uses 4 decimal places in Redis cache key', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(SAMPLE_RESPONSE),
      } as Response)

      await provider.fetchHourlyForecast(48.12345678, 2.98765432, new Date('2026-03-22T10:00:00Z'))

      expect(mockRedis.set).toHaveBeenCalledWith(
        'weather:48.1235:2.9877:2026-03-22:10',
        expect.any(String) as string,
        'EX',
        3600,
      )
    })

    it('continues gracefully when Redis is unavailable', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis connection lost'))
      mockRedis.set.mockRejectedValueOnce(new Error('Redis connection lost'))

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(SAMPLE_RESPONSE),
      } as Response)

      const result = await provider.fetchHourlyForecast(48.8566, 2.3522, new Date('2026-03-22T10:00:00Z'))

      expect(result).not.toBeNull()
      expect(result?.temperatureC).toBe(12.5)
    })
  })
})
