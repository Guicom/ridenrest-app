import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisProvider } from '../common/providers/redis.provider.js'
import { GEOAPIFY_CACHE_TTL } from '@ridenrest/shared'

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name)
  private readonly geoapifyApiKey: string

  constructor(
    private readonly redisProvider: RedisProvider,
    private readonly config: ConfigService,
  ) {
    this.geoapifyApiKey = this.config.get<string>('GEOAPIFY_API_KEY') ?? ''
    if (!this.geoapifyApiKey) {
      this.logger.warn('GEOAPIFY_API_KEY is not set — reverse geocoding will return null for all requests')
    }
  }

  async reverseCity(lat: number, lng: number): Promise<{ city: string | null; postcode: string | null }> {
    if (!this.geoapifyApiKey) {
      this.logger.debug(`reverseCity(${lat}, ${lng}): GEOAPIFY_API_KEY not set`)
      return { city: null, postcode: null }
    }

    const redis = this.redisProvider.getClient()
    const key = `geo:cityv2:${lat.toFixed(3)}:${lng.toFixed(3)}`

    const cached = await redis.get(key)
    if (cached !== null) {
      const parsed = JSON.parse(cached) as { city: string | null; postcode: string | null }
      return parsed
    }

    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&format=json&apiKey=${this.geoapifyApiKey}`

    let res: Response
    try {
      res = await fetch(url)
    } catch {
      this.logger.warn(`Geoapify fetch failed for lat=${lat} lng=${lng}`)
      return { city: null, postcode: null }
    }

    if (!res.ok) {
      this.logger.warn(`Geoapify returned HTTP ${res.status} for lat=${lat} lng=${lng}`)
      return { city: null, postcode: null }
    }

    const data = await res.json() as {
      results: Array<{ city?: string; town?: string; village?: string; municipality?: string; postcode?: string }>
    }
    const result = data.results?.[0]
    const city = result?.city ?? result?.town ?? result?.village ?? result?.municipality ?? null
    const postcode = result?.postcode ?? null
    this.logger.debug(`reverseCity(${lat}, ${lng}): result=${JSON.stringify(result)}, city=${city}, postcode=${postcode}`)

    await redis.set(key, JSON.stringify({ city, postcode }), 'EX', GEOAPIFY_CACHE_TTL)
    return { city, postcode }
  }
}
