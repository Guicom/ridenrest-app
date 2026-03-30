import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { WeatherService } from './weather.service.js'
import { WeatherRepository } from './weather.repository.js'
import { OpenMeteoProvider } from './providers/open-meteo.provider.js'
import type { GetWeatherDto } from './dto/get-weather.dto.js'
import { WEATHER_CACHE_TTL } from '@ridenrest/shared'

const mockWeatherRepo = {
  findSegmentByIdAndUserId: jest.fn(),
  upsertWeatherPoints: jest.fn(),
  findSegmentContainingKm: jest.fn(),
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
  precipitationMmH: 0.2,
  weatherCode: 1,
}

// Segment used for findSegmentContainingKm (adventure-wide km)
const SAMPLE_SEGMENT_FOR_KM = {
  id: 'seg-uuid-1',
  cumulativeStartKm: 50,
  distanceKm: 60,
  waypoints: [
    { dist_km: 0, lat: 48.0, lng: 2.0 },
    { dist_km: 10, lat: 48.1, lng: 2.1 },
    { dist_km: 20, lat: 48.2, lng: 2.2 },
    { dist_km: 30, lat: 48.3, lng: 2.3 },
    { dist_km: 40, lat: 48.4, lng: 2.4 },
    { dist_km: 50, lat: 48.5, lng: 2.5 },  // dist_km=50 → adventure km=100
    { dist_km: 60, lat: 48.6, lng: 2.6 },  // dist_km=60 → adventure km=110
  ],
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

  describe('getWeatherAtKm', () => {
    it('computes correct etaMs with departureTime and speedKmh, finds closest waypoint', async () => {
      mockWeatherRepo.findSegmentContainingKm.mockResolvedValueOnce(SAMPLE_SEGMENT_FOR_KM)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValueOnce(SAMPLE_WEATHER)

      // targetKm=95: relativeKm = 95 - 50 = 45 → closest waypoint is dist_km=40 (lat=48.4, lng=2.4)
      // speedKmh=20: etaMs = 08:00 + (95/20)*3600s = 08:00 + 4.75h = 12:45
      const departureTime = '2026-03-22T08:00:00.000Z'
      const result = await service.getWeatherAtKm('adv-1', 95, departureTime, 20)

      expect(result).not.toBeNull()
      expect(result!.temperatureC).toBe(15.0)
      expect(result!.windDirectionDeg).toBe(180)
      expect(result!.precipitationMmH).toBe(0.2)

      // Closest waypoint to relativeKm=45: dist_km=40 (diff=5) vs dist_km=50 (diff=5) → dist_km=40 wins (first in reduce)
      const [lat, lng] = [48.4, 2.4]
      const [callLat, callLng] = [
        (mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0] as [number, number, Date])[0],
        (mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0] as [number, number, Date])[1],
      ]
      expect(callLat).toBe(lat)
      expect(callLng).toBe(lng)

      // ETA: 08:00 + 4.75h = 12:45:00
      const callDate = (mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0] as [number, number, Date])[2]      expect(callDate.toISOString()).toBe('2026-03-22T12:45:00.000Z')
    })

    it('falls back to Date.now() when no departureTime', async () => {
      mockWeatherRepo.findSegmentContainingKm.mockResolvedValueOnce(SAMPLE_SEGMENT_FOR_KM)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValueOnce(SAMPLE_WEATHER)
      const before = Date.now()

      await service.getWeatherAtKm('adv-1', 95)

      const after = Date.now()
      const callDate = (mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0] as [number, number, Date])[2]      expect(callDate.getTime()).toBeGreaterThanOrEqual(before)
      expect(callDate.getTime()).toBeLessThanOrEqual(after)
    })

    it('returns null when findSegmentContainingKm returns null', async () => {
      mockWeatherRepo.findSegmentContainingKm.mockResolvedValueOnce(null)

      const result = await service.getWeatherAtKm('adv-1', 999)
      expect(result).toBeNull()
    })

    it('returns null when segment has no waypoints', async () => {
      mockWeatherRepo.findSegmentContainingKm.mockResolvedValueOnce({
        ...SAMPLE_SEGMENT_FOR_KM,
        waypoints: [],
      })

      const result = await service.getWeatherAtKm('adv-1', 60)
      expect(result).toBeNull()
    })

    it('returns null when fetchHourlyForecast returns null (beyond forecast horizon)', async () => {
      mockWeatherRepo.findSegmentContainingKm.mockResolvedValueOnce(SAMPLE_SEGMENT_FOR_KM)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValueOnce(null)

      const result = await service.getWeatherAtKm('adv-1', 60)
      expect(result).toBeNull()
    })

    it('defaults speedKmh to 15 when not provided', async () => {
      mockWeatherRepo.findSegmentContainingKm.mockResolvedValueOnce(SAMPLE_SEGMENT_FOR_KM)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValueOnce(SAMPLE_WEATHER)

      const departureTime = '2026-03-22T08:00:00.000Z'
      // targetKm=75: etaMs with speed=15 = 08:00 + (75/15)*3600s = 08:00 + 5h = 13:00
      await service.getWeatherAtKm('adv-1', 75, departureTime)  // no speedKmh = default 15

      const callDate = (mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0] as [number, number, Date])[2]      expect(callDate.toISOString()).toBe('2026-03-22T13:00:00.000Z')
    })
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
      const firstCallDate = mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0][2]      expect(firstCallDate.toISOString()).toBe('2026-03-22T08:30:00.000Z')
    })

    it('falls back to current time when no pace provided (FR-055)', async () => {
      mockWeatherRepo.findSegmentByIdAndUserId.mockResolvedValueOnce(SAMPLE_SEGMENT)
      mockOpenMeteoProvider.fetchHourlyForecast.mockResolvedValue(SAMPLE_WEATHER)
      const beforeCall = Date.now()

      const dto: GetWeatherDto = { segmentId: 'seg-uuid-1' }
      await service.getWeatherForecast(dto, 'user-1')

      const afterCall = Date.now()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const callDate = mockOpenMeteoProvider.fetchHourlyForecast.mock.calls[0][2]      expect(callDate.getTime()).toBeGreaterThanOrEqual(beforeCall)
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
      expect(expiresAt - cachedAt).toBeCloseTo(WEATHER_CACHE_TTL * 1000, -2)
    })
  })
})
