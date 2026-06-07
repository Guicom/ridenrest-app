// Consentement analytics (RGPD) — source de vérité partagée entre la bannière
// (consent-banner.tsx) et la section Confidentialité des Paramètres (story posthog-1).
//
// ⚠️ Ne JAMAIS utiliser posthog.has_opted_in_capturing() pour décider l'affichage
// de la bannière (piège connu PostHog : retourne false aussi quand aucun choix
// n'a été fait). La clé localStorage ci-dessous est l'unique source de vérité.
import posthog from 'posthog-js'

export const CONSENT_STORAGE_KEY = 'rnr_analytics_consent'
export const CONSENT_CHANGE_EVENT = 'rnr-analytics-consent-change'

export type AnalyticsConsent = 'granted' | 'denied'

/** Choix persisté, ou null si l'utilisateur n'a jamais répondu (→ bannière visible). */
export function getStoredConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    // localStorage indisponible (Safari private mode strict, etc.) → considéré sans choix
    return null
  }
}

/**
 * Persiste le choix et l'applique immédiatement à PostHog (opt-in ↔ opt-out).
 * Notifie les autres composants montés (bannière ↔ toggle settings) via un event window.
 */
export function setConsent(consent: AnalyticsConsent): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, consent)
  } catch {
    // Non bloquant : le choix s'applique pour la session courante même sans persistance
  }
  if (consent === 'granted') {
    posthog.opt_in_capturing()
    // Session replay gated consentement (story posthog-3) — l'init le laisse
    // désactivé (disable_session_recording: true), seul un opt-in le démarre
    posthog.startSessionRecording()
  } else {
    posthog.stopSessionRecording()
    posthog.opt_out_capturing()
  }
  window.dispatchEvent(new CustomEvent<AnalyticsConsent>(CONSENT_CHANGE_EVENT, { detail: consent }))
}
