'use client'

import { useEffect, useState } from 'react'
import posthog from 'posthog-js'
import { useSession } from '@/lib/auth/client'
import {
  CONSENT_CHANGE_EVENT,
  getStoredConsent,
  type AnalyticsConsent,
} from '@/lib/analytics-consent'

/**
 * Identify PostHog (story posthog-2, AC4) — monté dans le layout (app).
 *
 * - identify(user.id) UNIQUEMENT si session authentifiée ET consentement accordé
 *   (garde : ne jamais identifier en opt-out)
 * - réactif au consentement : un opt-in tardif via la bannière ou les Paramètres
 *   déclenche l'identify sans rechargement
 * - jamais d'email ni de PII dans les props — l'id Better Auth seul
 * - le reset() au logout est fait dans sign-out-button.tsx
 */
export function AnalyticsIdentity() {
  const { data: session } = useSession()
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null)

  useEffect(() => {
    setConsent(getStoredConsent())
    function handleChange(event: Event) {
      setConsent((event as CustomEvent<AnalyticsConsent>).detail)
    }
    window.addEventListener(CONSENT_CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handleChange)
  }, [])

  useEffect(() => {
    if (consent !== 'granted') return
    const userId = session?.user?.id
    if (!userId) return
    posthog.identify(userId)
  }, [consent, session?.user?.id])

  return null
}
