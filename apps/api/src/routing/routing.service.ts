/**
 * RoutingService — wrapper bas niveau de l'API HTTP BRouter.
 *
 * ── Décision circuit breaker : « MAISON » (vs cockatiel) ───────────────────────────────
 * AC #7 / Story 2.1 demandait de trancher cockatiel vs implémentation maison.
 * Retenu : MAISON (state machine ~60 lignes, voir plus bas). Raisons :
 *   - Aucune nouvelle dépendance runtime (cockatiel = +1 dep + ses transitives).
 *   - Logique simple et entièrement testable avec jest fake timers.
 *   - Contrôle total sur les motifs typés (BrouterFailureReason) et le logging structuré.
 * Décision documentée aussi dans docs/ops/access-routing-prereq-audit.md.
 *
 * ── Décision client HTTP : « fetch natif » (vs @nestjs/axios) ──────────────────────────
 * La story spec mentionnait @nestjs/axios / HttpModule, MAIS tout le projet (weather,
 * strava, geo) utilise `fetch` natif — aucune trace d'axios dans le repo. Décision
 * validée par Guillaume : rester cohérent avec le projet → `fetch` + AbortController pour
 * le timeout. Zéro nouvelle dépendance. (Déviation tracée dans le Dev Agent Record.)
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import accessConfig from '../config/access.config.js'
import { BrouterUnavailableException, type BrouterFailureReason } from './brouter-unavailable.exception.js'
import type { BrouterRoute, ComputeRouteParams, LonLat, LonLatEle } from './routing.types.js'

/** Forme partielle de la réponse GeoJSON BRouter (seuls les champs consommés sont typés). */
interface BrouterGeoJson {
  features?: Array<{
    properties?: Record<string, unknown>
    geometry?: { type?: string; coordinates?: number[][] }
  }>
}

type CircuitState = 'closed' | 'open' | 'half-open'

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name)

  /** Nombre d'échecs (dans la fenêtre) qui ouvre le circuit. */
  private static readonly FAILURE_THRESHOLD = 5
  /** Fenêtre glissante de comptage des échecs (ms). */
  private static readonly WINDOW_MS = 60_000
  /** Durée d'ouverture du circuit avant passage en half-open (ms). */
  private static readonly OPEN_DURATION_MS = 30_000

  private circuitState: CircuitState = 'closed'
  private openedAt = 0
  /** Timestamps des échecs récents (élagués à WINDOW_MS). */
  private failureTimestamps: number[] = []

  constructor(
    @Inject(accessConfig.KEY)
    private readonly config: ConfigType<typeof accessConfig>,
  ) {}

  /**
   * Calcule un itinéraire entre deux points via BRouter.
   * @param params from/to au format [lon, lat] (GeoJSON), profil BRouter.
   * @throws BrouterUnavailableException si timeout/réseau/HTTP/parse/circuit ouvert.
   */
  async computeRoute(params: ComputeRouteParams): Promise<BrouterRoute> {
    const { from, to, profile } = params
    const startedAt = Date.now()

    // ── Gate circuit breaker ────────────────────────────────────────────────
    this.assertCircuitClosed(profile, startedAt)

    const url = this.buildUrl(from, to, profile)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.brouterTimeoutMs)

    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } catch (err) {
      const reason: BrouterFailureReason =
        (err as Error)?.name === 'AbortError' ? 'timeout' : 'network'
      throw this.fail(profile, startedAt, reason, (err as Error)?.message)
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      throw this.fail(profile, startedAt, 'http_error', `HTTP ${res.status}`)
    }

    let json: unknown
    try {
      json = await res.json()
    } catch (err) {
      throw this.fail(profile, startedAt, 'parse_error', (err as Error)?.message)
    }

    let route: BrouterRoute
    try {
      route = this.parseResponse(json)
    } catch (err) {
      throw this.fail(profile, startedAt, 'parse_error', (err as Error)?.message)
    }

    this.onSuccess()
    return route
  }

  // ── Construction URL ───────────────────────────────────────────────────────

  private buildUrl(from: LonLat, to: LonLat, profile: string): string {
    const [lon1, lat1] = from
    const [lon2, lat2] = to
    const base = this.config.brouterBaseUrl.replace(/\/+$/, '')
    return `${base}/brouter?lonlats=${lon1},${lat1}|${lon2},${lat2}&profile=${profile}&alternativeidx=0&format=geojson`
  }

  // ── Parsing réponse BRouter ─────────────────────────────────────────────────

  private parseResponse(json: unknown): BrouterRoute {
    const data = json as BrouterGeoJson
    const feature = data?.features?.[0]
    if (!feature) {
      throw new Error('BRouter response has no features')
    }

    if (feature.geometry?.type !== 'LineString') {
      throw new Error(`BRouter response has unexpected geometry type: ${feature.geometry?.type ?? 'undefined'}`)
    }
    const coordinates = feature.geometry.coordinates
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      throw new Error('BRouter response has empty LineString coordinates')
    }

    const props = feature.properties ?? {}
    const distanceM = parseFloat(String(props['track-length']))
    if (Number.isNaN(distanceM)) {
      throw new Error('BRouter response missing/invalid track-length')
    }
    const ascend = parseFloat(String(props['filtered ascend']))
    const elevationGainM = Number.isNaN(ascend) ? 0 : Math.round(ascend)

    return {
      geometry: { type: 'LineString', coordinates: coordinates as LonLatEle[] },
      distanceM,
      elevationGainM,
      elevationLossM: this.computeElevationLoss(coordinates),
    }
  }

  /** Somme des deltas négatifs d'altitude entre points consécutifs du LineString 3D. */
  private computeElevationLoss(coordinates: number[][]): number {
    let loss = 0
    for (let i = 1; i < coordinates.length; i++) {
      const prev = coordinates[i - 1]?.[2]
      const cur = coordinates[i]?.[2]
      if (typeof prev === 'number' && typeof cur === 'number') {
        const delta = cur - prev
        if (delta < 0) loss += -delta
      }
    }
    return Math.round(loss)
  }

  // ── Circuit breaker (maison) ────────────────────────────────────────────────

  /** Bloque l'appel si le circuit est ouvert ; bascule en half-open après OPEN_DURATION_MS. */
  private assertCircuitClosed(profile: string, startedAt: number): void {
    if (this.circuitState !== 'open') return

    if (Date.now() - this.openedAt >= RoutingService.OPEN_DURATION_MS) {
      // Fenêtre d'ouverture écoulée → on autorise UNE requête de test.
      this.circuitState = 'half-open'
      return
    }

    // Toujours ouvert → rejet immédiat sans toucher BRouter.
    this.logger.warn({
      profile,
      durationMs: Date.now() - startedAt,
      reason: 'circuit_open' satisfies BrouterFailureReason,
      engineVersion: this.config.engineVersion,
    })
    throw new BrouterUnavailableException('circuit_open')
  }

  /** Succès : ferme le circuit et réinitialise la fenêtre d'échecs. */
  private onSuccess(): void {
    // Guard: ne pas fermer si un appel concurrent a ré-ouvert le circuit (half-open race).
    if (this.circuitState !== 'open') {
      this.circuitState = 'closed'
      this.failureTimestamps = []
    }
  }

  /**
   * Enregistre un échec, log structuré WARN, met à jour l'état du circuit,
   * puis retourne l'exception à lever (pattern `throw this.fail(...)` pour le control-flow TS).
   */
  private fail(
    profile: string,
    startedAt: number,
    reason: BrouterFailureReason,
    detail?: string,
  ): BrouterUnavailableException {
    const now = Date.now()
    this.logger.warn({
      profile,
      durationMs: now - startedAt,
      reason,
      engineVersion: this.config.engineVersion,
      ...(detail ? { detail } : {}),
    })

    if (this.circuitState === 'half-open') {
      // La requête de test a échoué → ré-ouverture immédiate pour OPEN_DURATION_MS.
      this.openCircuit(now)
    } else {
      this.failureTimestamps = this.failureTimestamps.filter(
        (t) => now - t < RoutingService.WINDOW_MS,
      )
      this.failureTimestamps.push(now)
      if (this.failureTimestamps.length >= RoutingService.FAILURE_THRESHOLD) {
        this.openCircuit(now)
      }
    }

    return new BrouterUnavailableException(reason, detail)
  }

  private openCircuit(now: number): void {
    this.circuitState = 'open'
    this.openedAt = now
    this.failureTimestamps = []
  }
}
