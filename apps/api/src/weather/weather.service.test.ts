import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { WeatherService } from './weather.service.js'
import { WeatherRepository } from './weather.repository.js'
import { OpenMeteoProvider } from './providers/open-meteo.provider.js'
import type { GetWeatherDto } from './dto/get-weather.dto.js'

const mockWeatherRepo = {
  findSegmentByIdAndUserId: jest.fn(),
  upsertWeatherPoints: jest.fn(),
}

const mockOpenMeteoProvider = {
  fetchHourlyForecast: jest.fn(),
}

const SAMPLE_SEGMENT = {
  id: 'seg-uuid-1',
  cumulativeStartKm: 10,
  distanceKm: 25,
  waypoints: [
    { dist_km: 0, lat: 48.0, lng: 2.0 },
    { dist_km: 5, lat: 48.1, lng: 2.1 },
    { dist_km: 10, lat: 48.2, lng: 2.2 },
    { dist_km: 15, lat: 48.3, lng: 2.3 },
    { dist_km: 20, lat: 48.4, lng: 2.4 },
    { dist_km: 25, lat: 48.5, lng: 2.5 },
  ],
}

const SAMPLE_WEATHER = {
  temperatureC: 15.0,
  windSpeedKmh: 20.0,
  windDirection: 180,
  precipitationProbability: 10,
  weatherCode: 1,
}

describe('WeatherService', () => {
  let service: WeatherService

  beforeEach(async () => {
    jest.clearAllMocks()
    mockWeatherRepo.upsertWeatherPoints.mockResolvedValue(undefined)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeatherService,
        { provide: WeatherRepository, useValue: mockWeatherRepo },
        { provide: OpenMeteoProvider, useValue: mockOpenMeteoProvider },
      ],
    }).compile()

    service = module.get<WeatherService>(WeatherService)
  })

  describe('getWeatherForecast', () => {
    it('throws NotFoundException when segment not found', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(null)

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      await expect(service.getWeatherForecast(dto, 'user-1')).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when segment not owned by user', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(null)

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      await expect(service.getWeatherForecast(dto, 'other-user')).rejects.toThrow(NotFoundException)
    })

    it('returns WeatherForecast with sampled waypoints at 5km intervals', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(SAMPLE_WEATHER)

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      const result = await service.getWeatherForecast(dto, 'user-1')

      expect(result.segmentId).toBe('seg-uuid-1')
      // 6 waypoints at 0, 5, 10, 15, 20, 25 km — all at 5km intervals
      expect(result.waypoints).toHaveLength(6)
    })

    it('maps WMO code to iconEmoji', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue({ ...SAMPLE_WEATHER, weatherCode: 0 })

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      const result = await service.getWeatherForecast(dto, 'user-1')

      expect(result.waypoints[0].iconEmoji).toBe('☀️')
    })

    it('uses fallback emoji for unknown WMO code', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue({ ...SAMPLE_WEATHER, weatherCode: 999 })

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      const result = await service.getWeatherForecast(dto, 'user-1')

      expect(result.waypoints[0].iconEmoji).toBe('🌡')
    })

    it('sets null fields for unavailable waypoints (beyond horizon)', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(null)

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      const result = await service.getWeatherForecast(dto, 'user-1')

      expect(result.waypoints[0].temperatureC).toBeNull()
      expect(result.waypoints[0].iconEmoji).toBeNull()
    })

    it('computes ETAs from departureTime and speedKmh', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(SAMPLE_WEATHER)

      const departureTime = '2026-03-22T08:00:00.000Z'
      const speedKmh = 20
      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1', departureTime, speedKmh }
      await service.getWeatherForecast(dto, 'user-1')

      // First waypoint: adventureKm = 10 + 0 = 10km, eta = 08:00 + (10/20)*3600s = 08:00 + 30min = 08:30
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const firstCallDate = mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0][2] as Date
      expect(firstCallDate.toISOString()).toBe('2026-03-22T08:30:00.000Z')
    })

    it('falls back to current time when no pace provided (FR-055)', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(SAMPLE_WEATHER)
      const beforeCall = Date.now()

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      await service.getWeatherForecast(dto, 'user-1')

      const afterCall = Date.now()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const callDate = mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0][2] as Date
      expect(callDate.getTime()).toBeGreaterThanOrEqual(beforeCall)
      expect(callDate.getTime()).toBeLessThanOrEqual(afterCall)
    })

    it('uses Promise.allSettled — does not throw when some fetches fail', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast
        .mockResolvedValueOnce(SAMPLE_WEATHER)
        .mockRejectedValueOnce(new Error('Network'))
        .mockResolvedValue(SAMPLE_WEATHER)

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      const result = await service.getWeatherForecast(dto, 'user-1')

      // Should not throw — rejected calls produce null waypoints
      expect(result.waypoints).toHaveLength(6)
      expect(result.waypoints[1].temperatureC).toBeNull()
    })

    it('filters waypoints by fromKm — excludes past waypoints', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(SAMPLE_WEATHER)

      // cumulativeStartKm=10, waypoints at dist_km 0,5,10,15,20,25
      // adventure km: 10,15,20,25,30,35
      // fromKm=25 → only dist_km 15,20,25 (adventure km 25,30,35)
      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1', fromKm: 25 }
      const result = await service.getWeatherForecast(dto, 'user-1')

      expect(result.waypoints).toHaveLength(3)
      expect(result.waypoints[0].km).toBe(25)
      expect(result.waypoints[1].km).toBe(30)
      expect(result.waypoints[2].km).toBe(35)
    })

    it('returns empty waypoints when fromKm is beyond segment end', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(SAMPLE_WEATHER)

      // adventure km max = 10 + 25 = 35, fromKm=100 → no waypoints
      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1', fromKm: 100 }
      const result = await service.getWeatherForecast(dto, 'user-1')

      expect(result.waypoints).toHaveLength(0)
      expect(result.segmentId).toBe('seg-uuid-1')
    })

    it('returns all waypoints when fromKm is undefined (existing behaviour)', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(SAMPLE_WEATHER)

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      const result = await service.getWeatherForecast(dto, 'user-1')

      expect(result.waypoints).toHaveLength(6)
    })

    it('returns correct segmentId, cachedAt, expiresAt structure', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(SAMPLE_WEATHER)

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      const before = Date.now()
      const result = await service.getWeatherForecast(dto, 'user-1')
      const after = Date.now()

      expect(result.segmentId).toBe('seg-uuid-1')
      const cachedAt = new Date(result.cachedAt).getTime()
      const expiresAt = new Date(result.expiresAt).getTime()
      expect(cachedAt).toBeGreaterThanOrEqual(before)
      expect(cachedAt).toBeLessThanOrEqual(after)
      expect(expiresAt - cachedAt).toBeCloseTo(3600 * 1000, -2)
    })
  })
})
