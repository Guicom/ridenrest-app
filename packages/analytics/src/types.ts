/**
 * Taxonomie analytics Ride'n'Rest — types partagés web/mobile.
 *
 * Règle d'architecture : ce package n'importe AUCUN SDK vendor.
 * Le transport (posthog-js sur web, posthog-react-native sur mobile)
 * est injecté via setAnalyticsClient() — cf. client.ts.
 *
 * Règle RGPD : jamais de coordonnée GPS, d'email ni de PII dans les props.
 * Les ids d'aventure sont anonymisés via hashAdventureId().
 */

/** Noms d'events de la taxonomie — toute addition passe par cette union. */
export type AnalyticsEvent =
  | 'booking_click'
  | 'gpx_uploaded'
  | 'map_opened'
  | 'poi_search_triggered'
  | 'poi_detail_opened'
  | 'live_mode_activated'
  | 'landing_cta_clicked'
  | 'signup_started'
  | 'signup_completed'
  | 'login_completed'

/**
 * Transport injecté (vendor-agnostic).
 * Web : `{ capture: (e, p) => posthog.capture(e, p) }` (posthog-js)
 * Mobile (MOB-6.1) : idem avec posthog-react-native.
 */
export interface AnalyticsClient {
  capture(event: AnalyticsEvent, properties?: Record<string, string>): void
}

export type UserTier = 'free' | 'pro' | 'team' | 'anonymous'

export interface BookingClickProps {
  source: 'booking.com' | 'airbnb'
  poi_type: string
  page: 'map' | 'live'
  user_tier: UserTier
}

export interface GpxUploadedProps {
  segment_count: number
  total_km: number
}

export interface MapOpenedProps {
  adventure_id_hash: string
}

export interface PoiSearchTriggeredProps {
  mode: 'planning' | 'live'
  poi_categories: string[]
  result_count: number
}

export interface PoiDetailOpenedProps {
  poi_type: string
  source: 'overpass' | 'google'
}

export interface LiveModeActivatedProps {
  /** Seule prop autorisée — JAMAIS de coordonnée GPS (règle RGPD projet). */
  adventure_id_hash: string
}

// ── Funnel d'acquisition (landing → signup) ────────────────────────────────

/** Emplacement du CTA « Se connecter / Mes aventures » sur la landing. */
export type LandingCtaPlacement =
  | 'header'
  | 'feature_step_one'
  | 'feature_step_two'
  | 'feature_step_three'

export interface LandingCtaClickedProps {
  placement: LandingCtaPlacement
  /** true si le CTA affichait « Mes aventures » (session active), false pour « Se connecter ». */
  authenticated: boolean
}

export type AuthMethod = 'email' | 'google'

export interface SignupStartedProps {
  method: AuthMethod
}

export interface SignupCompletedProps {
  method: AuthMethod
}

export interface LoginCompletedProps {
  method: AuthMethod
}
