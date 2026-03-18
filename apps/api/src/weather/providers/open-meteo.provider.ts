import { Injectable, Logger } from '@nestjs/common'
import { RedisProvider } from '../../common/providers/redis.provider.js'
import { WEATHER_CACHE_TTL } from '@ridenrest/shared'

export interface OpenMeteoHour {
  temperatureC: number
  windSpeedKmh: number
  windDirection: number
  precipitationProbability: number
  weatherCode: number
}

interface OpenMeteoResponse {
  hourly: {
    time: string[]
    temperature_2m: number[]
    wind_speed_10m: number[]
    wind_direction_10m: number[]
    precipitation_probability: number[]
    weather_code: number[]
  }
}

@Injectable()
export class OpenMeteoProvider {
  private readonly logger = new Logger(OpenMeteoProvider.name)
  private readonly BASE_URL = 'https://api.open-meteo.com/v1/forecast'

  constructor(private readonly redisProvider: RedisProvider) {}

  /**
   * Fetch hourly weather forecast for a given lat/lng at a specific datetime.
   * Returns null if beyond horizon or fetch fails — never throws.
   * Redis cache: weather:{lat.toFixed(4)}:{lng.toFixed(4)}:{YYYY-MM-DD}:{HH} TTL=1h
   */
  async fetchHourlyForecast(lat: number, lng: number, forecastDatetime: Date): Promise<OpenMeteoHour | null> {
    const dateStr = forecastDatetime.toISOString().substring(0, 10)           // YYYY-MM-DD
    const hourStr = forecastDatetime.toISOString().substring(11, 13)          // HH
    const cacheKey = `weather:${lat.toFixed(4)}:${lng.toFixed(4)}:${dateStr}:${hourStr}`

    // Redis cache check
    try {
      const redis = this.redisProvider.getClient()
      const cached = await redis.get(cacheKey)
      if (cached) {
        this.logger.debug(`Redis HIT — ${cacheKey}`)
        const parsed: OpenMeteoHour | null = JSON.parse(cached) as OpenMeteoHour | null
        return parsed
      }
    } catch (err) {
      this.logger.warn(`Redis GET failed for ${cacheKey}: ${(err as Error).message}`)
    }

    // Build Open-Meteo request
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code',
      start_date: dateStr,
      end_date: dateStr,
      timezone: 'UTC',
    })

    let result: OpenMeteoHour | null = null

    try {
      const response = await fetch(`${this.BASE_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        this.logger.warn(`Open-Meteo HTTP ${response.status} for lat=${lat} lng=${lng}`)
        return null
      }

      const data = (await response.json()) as OpenMeteoResponse

      // Find matching hour: format ETA as "YYYY-MM-DDTHH:00"
      const targetStr = `${dateStr}T${hourStr}:00`
      const idx = data.hourly.time.findIndex((t) => t === targetStr)

      if (idx === -1) {
        this.logger.debug(`Beyond horizon — no match for ${targetStr}`)
        // Store null in cache to avoid repeat calls
        result = null
      } else {
        result = {
          temperatureC: data.hourly.temperature_2m[idx],
          windSpeedKmh: data.hourly.wind_speed_10m[idx],
          windDirection: data.hourly.wind_direction_10m[idx],
          precipitationProbability: data.hourly.precipitation_probability[idx],
          weatherCode: data.hourly.weather_code[idx],
        }
      }
    } catch (err) {
      this.logger.warn(`Open-Meteo fetch failed for lat=${lat} lng=${lng}: ${(err as Error).message}`)
      return null
    }

    // Cache result (including null = beyond horizon)
    try {
      const redis = this.redisProvider.getClient()
      await redis.set(cacheKey, JSON.stringify(result), 'EX', WEATHER_CACHE_TTL)
    } catch (err) {
      this.logger.warn(`Redis SET failed for ${cacheKey}: ${(err as Error).message}`)
    }

    return result
  }
}
