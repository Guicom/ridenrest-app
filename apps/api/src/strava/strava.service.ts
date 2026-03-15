import { Injectable, NotFoundException, Logger, HttpException, HttpStatus } from '@nestjs/common'
import { db, account } from '@ridenrest/database'
import { and, eq } from 'drizzle-orm'
import { SegmentsService } from '../segments/segments.service.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

const STRAVA_API = 'https://www.strava.com/api/v3'
const ROUTES_CACHE_TTL = 3600       // 1 hour
const RATE_15MIN_KEY = 'strava:rate:15min'
const RATE_DAILY_KEY = 'strava:rate:daily'

export interface StravaRouteItem {
  id: string
  name: string
  distanceKm: number
  elevationGainM: number | null
}

@Injectable()
export class StravaService {
  private readonly logger = new Logger(StravaService.name)

  constructor(
    private readonly segmentsService: SegmentsService,
    private readonly adventuresService: AdventuresService,
    private readonly redisProvider: RedisProvider,
  ) {}

  async listRoutes(userId: string): Promise<StravaRouteItem[]> {
    const redis = this.redisProvider.getClient()
    const cacheKey = `strava:routes:v2:${userId}`

    // Cache HIT
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached) as StravaRouteItem[]

    // Get valid token + check rate limit
    const token = await this.getValidAccessToken(userId)
    await this.checkAndIncrementRateLimit()

    // Fetch routes from Strava (list up to 30 most recent)
    const athleteId = await this.getAthleteId(userId)
    const res = await fetch(`${STRAVA_API}/athletes/${athleteId}/routes?per_page=30`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new HttpException('Erreur Strava API', HttpStatus.BAD_GATEWAY)
    // Strava route IDs exceed Number.MAX_SAFE_INTEGER — parse raw text first,
    // replacing numeric "id" fields with strings before JSON.parse corrupts them
    const rawText = await res.text()
    const safeText = rawText.replace(/"id"\s*:\s*(\d{10,})/g, '"id":"$1"')
    const raw = JSON.parse(safeText) as Array<{
      id: string; name: string; distance: number; elevation_gain: number | null
    }>

    const routes: StravaRouteItem[] = raw.map((r) => ({
      id: String(r.id),
      name: r.name,
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      elevationGainM: r.elevation_gain ?? null,
    }))

    // Cache for 1h
    await redis.set(cacheKey, JSON.stringify(routes), 'EX', ROUTES_CACHE_TTL)
    return routes
  }

  async importRoute(
    userId: string,
    stravaRouteId: string,
    adventureId: string,
  ): Promise<AdventureSegmentResponse> {
    // Verify adventure ownership
    await this.adventuresService.verifyOwnership(adventureId, userId)

    // Get token + rate limit
    const token = await this.getValidAccessToken(userId)
    await this.checkAndIncrementRateLimit()

    // Fetch GPX from Strava
    const gpxRes = await fetch(`${STRAVA_API}/routes/${stravaRouteId}/export_gpx`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!gpxRes.ok) {
      const body = await gpxRes.text().catch(() => '')
      this.logger.error(`[Strava] GPX export failed: ${gpxRes.status} ${gpxRes.statusText} — ${body}`)
      throw new HttpException(`Erreur récupération GPX Strava (${gpxRes.status})`, HttpStatus.BAD_GATEWAY)
    }
    const gpxBuffer = Buffer.from(await gpxRes.arrayBuffer())

    // Get route name from cache (avoid extra API call)
    const redis = this.redisProvider.getClient()
    const cacheKey = `strava:routes:v2:${userId}`
    const cached = await redis.get(cacheKey)
    const routes = cached ? (JSON.parse(cached) as StravaRouteItem[]) : []
    const routeName = routes.find((r) => r.id === stravaRouteId)?.name ?? `Route Strava ${stravaRouteId}`

    // Construct a Multer.File-like object to reuse createSegment logic
    const fakeFile = {
      buffer: gpxBuffer,
      originalname: `${routeName}.gpx`,
      size: gpxBuffer.length,
      fieldname: 'file',
      encoding: '7bit',
      mimetype: 'application/gpx+xml',
      stream: null as unknown as NodeJS.ReadableStream,
      destination: '',
      filename: '',
      path: '',
    } as Express.Multer.File

    // Reuse existing createSegment — handles file write + DB + BullMQ
    const segment = await this.segmentsService.createSegment(adventureId, userId, fakeFile, routeName, 'strava')
    return segment
  }

  // ─── Token management ────────────────────────────────────────────────────

  private async getValidAccessToken(userId: string): Promise<string> {
    const [acct] = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'strava')))

    if (!acct?.accessToken) {
      throw new NotFoundException('Compte Strava non connecté. Va dans les paramètres pour connecter Strava.')
    }

    // Refresh if expired (or expires within 5 minutes)
    const expiresAt = acct.accessTokenExpiresAt
    if (expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      return this.refreshAccessToken(acct.id, acct.refreshToken!)
    }

    return acct.accessToken
  }

  private async refreshAccessToken(accountId: string, refreshToken: string): Promise<string> {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env['STRAVA_CLIENT_ID'],
        client_secret: process.env['STRAVA_CLIENT_SECRET'],
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) throw new HttpException('Erreur refresh token Strava', HttpStatus.BAD_GATEWAY)

    const data = (await res.json()) as {
      access_token: string; refresh_token: string; expires_at: number
    }

    // Update DB
    await db.update(account)
      .set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        accessTokenExpiresAt: new Date(data.expires_at * 1000),
        updatedAt: new Date(),
      })
      .where(eq(account.id, accountId))

    return data.access_token
  }

  private async getAthleteId(userId: string): Promise<string> {
    const [acct] = await db
      .select({ accountId: account.accountId })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'strava')))
    if (!acct) throw new NotFoundException('Compte Strava non connecté')
    return acct.accountId  // Better Auth stores Strava athlete ID as accountId
  }

  // ─── Rate limiting ───────────────────────────────────────────────────────

  private async checkAndIncrementRateLimit(): Promise<void> {
    const redis = this.redisProvider.getClient()

    // 15-minute window (global — shared across all users)
    const count15 = await redis.incr(RATE_15MIN_KEY)
    if (count15 === 1) await redis.expire(RATE_15MIN_KEY, 900)
    if (count15 >= 100) {
      throw new HttpException('Réessaie dans quelques minutes (limite Strava 15min atteinte)', HttpStatus.TOO_MANY_REQUESTS)
    }
    if (count15 >= 80) this.logger.warn(`[Strava] Rate 15min: ${count15}/100`)

    // Daily window
    const countDaily = await redis.incr(RATE_DAILY_KEY)
    if (countDaily === 1) await redis.expire(RATE_DAILY_KEY, 86400)
    if (countDaily >= 1000) {
      throw new HttpException("Limite Strava atteinte pour aujourd'hui, réessaie demain", HttpStatus.TOO_MANY_REQUESTS)
    }
    if (countDaily >= 800) this.logger.warn(`[Strava] Rate daily: ${countDaily}/1000`)
  }
}
