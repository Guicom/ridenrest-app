import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { WeatherRepository } from './weather.repository.js'
import { OpenMeteoProvider } from './providers/open-meteo.provider.js'
import { GetWeatherDto } from './dto/get-weather.dto.js'
import { WMO_ICON, WMO_ICON_FALLBACK } from '@ridenrest/shared'
import type { WeatherForecast, WeatherPoint } from '@ridenrest/shared'

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

    // Compute ETA per sampled waypoint
    const departureTime = dto.departureTime ? new Date(dto.departureTime) : null
    const speedKmh = dto.speedKmh ?? null

    const etas: Date[] = sampled.map((wp) => {
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
    for (let i = 0; i < sampled.length; i += CONCURRENCY) {
      const batch = sampled.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.allSettled(
        batch.map((wp, j) => this.openMeteoProvider.fetchHourlyForecast(wp.lat, wp.lng, etas[i + j])),
      )
      fetchResults.push(...batchResults)
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 3600 * 1000)

    // Map results to WeatherPoint[]
    const weatherPoints: WeatherPoint[] = sampled.map((wp, i) => {
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
}
