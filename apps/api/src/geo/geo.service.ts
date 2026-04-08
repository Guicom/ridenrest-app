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

  async reverseCity(lat: number, lng: number): Promise<{ city: string | null; postcode: string | null; state: string | null; country: string | null }> {
    if (!this.geoapifyApiKey) {
      this.logger.debug(`reverseCity(${lat}, ${lng}): GEOAPIFY_API_KEY not set`)
      return { city: null, postcode: null, state: null, country: null }
    }

    const redis = this.redisProvider.getClient()
    const key = `geo:cityv3:${lat.toFixed(3)}:${lng.toFixed(3)}`

    const cached = await redis.get(key)
    if (cached !== null) {
      const parsed = JSON.parse(cached) as { city: string | null; postcode: string | null; state: string | null; country: string | null }
      return parsed
    }

    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&format=json&apiKey=${this.geoapifyApiKey}`

    let res: Response
    try {
      res = await fetch(url)
    } catch {
      this.logger.warn(`Geoapify fetch failed for lat=${lat} lng=${lng}`)
      return { city: null, postcode: null, state: null, country: null }
    }

    if (!res.ok) {
      this.logger.warn(`Geoapify returned HTTP ${res.status} for lat=${lat} lng=${lng}`)
      return { city: null, postcode: null, state: null, country: null }
    }

    const data = await res.json() as {
      results: Array<{ city?: string; town?: string; village?: string; municipality?: string; postcode?: string; state?: string; country?: string }>
    }
    const result = data.results?.[0]
    const city = result?.city ?? result?.town ?? result?.village ?? result?.municipality ?? null
    const postcode = result?.postcode ?? null
    const state = result?.state ?? null
    const country = result?.country ?? null
    this.logger.debug(`reverseCity(${lat}, ${lng}): result=${JSON.stringify(result)}, city=${city}, postcode=${postcode}, state=${state}, country=${country}`)

    await redis.set(key, JSON.stringify({ city, postcode, state, country }), 'EX', GEOAPIFY_CACHE_TTL)
    return { city, postcode, state, country }
  }

  async reverseAddress(lat: number, lng: number): Promise<{ address: string | null }> {
    if (!this.geoapifyApiKey) {
      return { address: null }
    }

    const redis = this.redisProvider.getClient()
    const key = `geo:addr:${lat.toFixed(4)}:${lng.toFixed(4)}`

    const cached = await redis.get(key)
    if (cached !== null) {
      try {
        return JSON.parse(cached) as { address: string | null }
      } catch {
        this.logger.warn(`Invalid Redis JSON for reverse-address cache key=${key}`)
      }
    }

    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&format=json&apiKey=${this.geoapifyApiKey}`

    let res: Response
    try {
      res = await fetch(url)
    } catch {
      this.logger.warn(`Geoapify fetch failed for reverse-address lat=${lat} lng=${lng}`)
      return { address: null }
    }

    if (!res.ok) {
      this.logger.warn(`Geoapify returned HTTP ${res.status} for reverse-address lat=${lat} lng=${lng}`)
      return { address: null }
    }

    let data: { results: Array<{ formatted?: string }> }
    try {
      data = await res.json() as { results: Array<{ formatted?: string }> }
    } catch {
      this.logger.warn(`Geoapify returned invalid JSON for reverse-address lat=${lat} lng=${lng}`)
      return { address: null }
    }
    const address = data.results?.[0]?.formatted ?? null

    await redis.set(key, JSON.stringify({ address }), 'EX', GEOAPIFY_CACHE_TTL)
    return { address }
  }
}
