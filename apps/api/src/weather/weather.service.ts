import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { WeatherRepository } from './weather.repository.js'
import { OpenMeteoProvider } from './providers/open-meteo.provider.js'
import { GetWeatherDto } from './dto/get-weather.dto.js'
import { WMO_ICON, WMO_ICON_FALLBACK, WEATHER_CACHE_TTL } from '@ridenrest/shared'
import type { WeatherForecast, WeatherPoint, StageWeatherPoint } from '@ridenrest/shared'

const SAMPLE_KM = 5

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name)

  constructor(
    private readonly weatherRepo: WeatherRepository,
    private readonly openMeteoProvider: OpenMeteoProvider,
  ) {}

  async getWeatherForecast(dto: GetWeatherDto, userId: string): Promise<WeatherForecast> {
    // Ownership check
    const segment = await this.weatherRepo.findSegmentByIdAndUserId(dto.segmentId, userId)
    if (!segment) {
      throw new NotFoundException('Segment not found or not ready')
    }

    const waypoints = (segment.waypoints ?? []) as Array<{ dist_km: number; lat: number; lng: number }>
    if (waypoints.length === 0) {
      throw new NotFoundException('Segment has no waypoints')
    }

    // Sample at SAMPLE_KM intervals
    const sampled: Array<{ dist_km: number; lat: number; lng: number }> = []
    for (const wp of waypoints) {
      if (sampled.length === 0 || wp.dist_km - sampled.at(-1)!.dist_km >= SAMPLE_KM) {
        sampled.push(wp)
      }
    }

    // Filter by fromKm (adventure-cumulative km) if provided
    const filtered = dto.fromKm !== undefined
      ? sampled.filter(wp => (segment.cumulativeStartKm + wp.dist_km) >= dto.fromKm!)
      : sampled

    // Early return if no waypoints after filtering
    if (filtered.length === 0) {
      return {
        segmentId: dto.segmentId,
        waypoints: [],
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + WEATHER_CACHE_TTL * 1000).toISOString(),
      }
    }

    // Compute ETA per sampled waypoint
    const departureTime = dto.departureTime ? new Date(dto.departureTime) : null
    const speedKmh = dto.speedKmh ?? null

    const etas: Date[] = filtered.map((wp) => {
      if (departureTime && speedKmh) {
        const adventureKm = segment.cumulativeStartKm + wp.dist_km
        const etaMs = departureTime.getTime() + (adventureKm / speedKmh) * 3_600_000
        return new Date(etaMs)
      }
      return new Date()  // FR-055: fallback to current time if no pace
    })

    // Fetch weather with bounded concurrency (max 5) to avoid Open-Meteo rate limits
    const CONCURRENCY = 5
    const fetchResults: PromiseSettledResult<Awaited<ReturnType<typeof this.openMeteoProvider.fetchHourlyForecast>>>[] = []
    for (let i = 0; i < filtered.length; i += CONCURRENCY) {
      const batch = filtered.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.allSettled(
        batch.map((wp, j) => this.openMeteoProvider.fetchHourlyForecast(wp.lat, wp.lng, etas[i + j])),
      )
      fetchResults.push(...batchResults)
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + WEATHER_CACHE_TTL * 1000)

    // Map results to WeatherPoint[]
    const weatherPoints: WeatherPoint[] = filtered.map((wp, i) => {
      const result = fetchResults[i]
      const data = result.status === 'fulfilled' ? result.value : null

      const iconEmoji = data?.weatherCode != null
        ? (WMO_ICON[data.weatherCode] ?? WMO_ICON_FALLBACK)
        : null

      return {
        km: segment.cumulativeStartKm + wp.dist_km,
        forecastAt: etas[i].toISOString(),
        temperatureC: data?.temperatureC ?? null,
        precipitationProbability: data?.precipitationProbability ?? null,
        windSpeedKmh: data?.windSpeedKmh ?? null,
        windDirection: data?.windDirection ?? null,
        weatherCode: data?.weatherCode ?? null,
        iconEmoji,
      }
    })

    // Fire-and-forget DB upsert (non-blocking)

    const dbPoints = weatherPoints.map((wp) => ({
      segmentId: dto.segmentId,
      waypointKm: wp.km,
      forecastAt: new Date(wp.forecastAt),
      temperatureC: wp.temperatureC,
      precipitationProbability: wp.precipitationProbability,
      windSpeedKmh: wp.windSpeedKmh,
      windDirection: wp.windDirection,
      weatherCode: wp.weatherCode,
    }))
    this.weatherRepo.upsertWeatherPoints(dbPoints).catch((err: unknown) => {
      this.logger.warn(`DB upsert failed: ${(err as Error).message}`)
    })

    return {
      segmentId: dto.segmentId,
      waypoints: weatherPoints,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }
  }

  /** Fetch a single weather point at adventure-wide `targetKm`.
   *  Used by the stage weather endpoint. Returns null if waypoints unavailable. */
  async getWeatherAtKm(
    adventureId: string,
    targetKm: number,
    departureTime?: string,
    speedKmh?: number,
  ): Promise<StageWeatherPoint | null> {
    const segment = await this.weatherRepo.findSegmentContainingKm(adventureId, targetKm)
    if (!segment || segment.waypoints.length === 0) return null

    const relativeKm = targetKm - segment.cumulativeStartKm
    const closestWp = segment.waypoints.reduce((best, wp) => {
      return Math.abs(wp.dist_km - relativeKm) < Math.abs(best.dist_km - relativeKm) ? wp : best
    })

    const speed = speedKmh ?? 15  // default 15 km/h (consistent with story 11.1)
    const etaMs = departureTime
      ? new Date(departureTime).getTime() + (targetKm / speed) * 3_600_000
      : Date.now()

    const data = await this.openMeteoProvider.fetchHourlyForecast(closestWp.lat, closestWp.lng, new Date(etaMs))
    if (!data) return null

    const iconEmoji = WMO_ICON[data.weatherCode] ?? WMO_ICON_FALLBACK

    return {
      forecastAt: new Date(etaMs).toISOString(),
      temperatureC: data.temperatureC,
      precipitationMmH: data.precipitationMmH,
      windSpeedKmh: data.windSpeedKmh,
      windDirectionDeg: data.windDirection,
      iconEmoji,
    }
  }
}
