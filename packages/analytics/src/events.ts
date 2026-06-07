/**
 * Helpers d'events — signatures migrées depuis apps/web/src/lib/analytics.ts
 * (story posthog-2). Props TOUJOURS stringifiées (Record<string, string>) :
 * compat PostHog OK et contrat identique à l'historique Plausible.
 */
import { capture } from './client'
import type {
  BookingClickProps,
  GpxUploadedProps,
  LandingCtaClickedProps,
  LiveModeActivatedProps,
  LoginCompletedProps,
  MapOpenedProps,
  PoiDetailOpenedProps,
  PoiSearchTriggeredProps,
  SignupCompletedProps,
  SignupStartedProps,
} from './types'

/**
 * Anonymisation des ids d'aventure (hash djb2-like, 8 chars base36).
 * Utilisé par map_opened et live_mode_activated — jamais d'UUID brut dans les props.
 */
export function hashAdventureId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36).slice(0, 8)
}

export function trackBookingClick(props: BookingClickProps): void {
  const p: Record<string, string> = { ...props }
  capture('booking_click', p)
}

export function trackGpxUploaded(props: GpxUploadedProps): void {
  capture('gpx_uploaded', {
    segment_count: String(props.segment_count),
    total_km: String(Math.round(props.total_km)),
  })
}

export function trackMapOpened(props: MapOpenedProps): void {
  capture('map_opened', { ...props })
}

export function trackPoiSearchTriggered(props: PoiSearchTriggeredProps): void {
  capture('poi_search_triggered', {
    mode: props.mode,
    poi_categories: props.poi_categories.join(','),
    result_count: String(props.result_count),
  })
}

export function trackPoiDetailOpened(props: PoiDetailOpenedProps): void {
  capture('poi_detail_opened', { ...props })
}

/**
 * Activation du mode Live (après acceptation du consentement géolocalisation).
 * RGPD : aucune coordonnée GPS — seule prop autorisée : adventure_id_hash.
 */
export function trackLiveModeActivated(props: LiveModeActivatedProps): void {
  capture('live_mode_activated', { ...props })
}

// ── Funnel d'acquisition (landing → signup) ────────────────────────────────

/** Clic sur un CTA « Se connecter / Mes aventures » de la landing. */
export function trackLandingCtaClicked(props: LandingCtaClickedProps): void {
  capture('landing_cta_clicked', {
    placement: props.placement,
    authenticated: String(props.authenticated),
  })
}

/** Début d'inscription : soumission du formulaire email ou clic Google sur /register. */
export function trackSignupStarted(props: SignupStartedProps): void {
  capture('signup_started', { ...props })
}

/**
 * Compte créé avec succès. Émis côté client pour method='email' uniquement —
 * le flow Google redirige hors domaine avant résolution (limitation documentée
 * au README ; la complétion Google se lit via la création de person PostHog).
 */
export function trackSignupCompleted(props: SignupCompletedProps): void {
  capture('signup_completed', { ...props })
}

/** Connexion réussie (même limitation Google que signup_completed). */
export function trackLoginCompleted(props: LoginCompletedProps): void {
  capture('login_completed', { ...props })
}
