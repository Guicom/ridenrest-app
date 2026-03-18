import { Injectable } from '@nestjs/common'
import { db } from '@ridenrest/database'
import { adventureSegments, adventures, weatherCache } from '@ridenrest/database'
import { eq, and, sql } from 'drizzle-orm'

export interface SegmentForWeather {
  id: string
  waypoints: Array<{ dist_km: number; lat: number; lng: number; ele?: number }> | null
  cumulativeStartKm: number
  distanceKm: number
}

export interface InsertWeatherPoint {
  segmentId: string
  waypointKm: number
  forecastAt: Date
  temperatureC: number | null
  precipitationProbability: number | null
  windSpeedKmh: number | null
  windDirection: number | null
  weatherCode: number | null
}

@Injectable()
export class WeatherRepository {
  async findSegmentByIdAndUserId(segmentId: string, userId: string): Promise<SegmentForWeather | null> {
    const [row] = await db
      .select({
        id: adventureSegments.id,
        waypoints: adventureSegments.waypoints,
        cumulativeStartKm: adventureSegments.cumulativeStartKm,
        distanceKm: adventureSegments.distanceKm,
      })
      .from(adventureSegments)
      .innerJoin(adventures, eq(adventureSegments.adventureId, adventures.id))
      .where(
        and(
          eq(adventureSegments.id, segmentId),
          eq(adventures.userId, userId),
          eq(adventureSegments.parseStatus, 'done'),
        ),
      )
    if (!row) return null
    return {
      ...row,
      waypoints: row.waypoints as SegmentForWeather['waypoints'],
    }
  }

  async upsertWeatherPoints(points: InsertWeatherPoint[]): Promise<void> {
    if (points.length === 0) return

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 3600 * 1000)

    await db
      .insert(weatherCache)
      .values(
        points.map((p) => ({
          segmentId: p.segmentId,
          waypointKm: p.waypointKm,
          forecastAt: p.forecastAt,
          temperatureC: p.temperatureC,
          precipitationMm: p.precipitationProbability,  // DB column is precipitationMm but stores probability % (0–100)
          windSpeedKmh: p.windSpeedKmh,
          windDirection: p.windDirection,
          weatherCode: p.weatherCode !== null ? String(p.weatherCode) : null,  // DB column is text; convert number → string for storage
          cachedAt: now,
          expiresAt,
        })),
      )
      .onConflictDoUpdate({
        target: [weatherCache.segmentId, weatherCache.waypointKm, weatherCache.forecastAt],
        set: {
          temperatureC: sql`excluded.temperature_c`,
          precipitationMm: sql`excluded.precipitation_mm`,
          windSpeedKmh: sql`excluded.wind_speed_kmh`,
          windDirection: sql`excluded.wind_direction`,
          weatherCode: sql`excluded.weather_code`,
          cachedAt: sql`excluded.cached_at`,
          expiresAt: sql`excluded.expires_at`,
        },
      })
  }
}
