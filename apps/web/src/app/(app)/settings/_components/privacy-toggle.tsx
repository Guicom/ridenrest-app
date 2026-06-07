'use client'

import { useEffect, useState } from 'react'
import {
  CONSENT_CHANGE_EVENT,
  getStoredConsent,
  setConsent,
  type AnalyticsConsent,
} from '@/lib/analytics-consent'

/**
 * Toggle Confidentialité (Paramètres) — story posthog-1.
 * Lit/écrit le même état que la bannière de consentement (localStorage
 * rnr_analytics_consent) ; opt-in/opt-out PostHog appliqué immédiatement.
 */
export function PrivacyToggle() {
  const [consent, setConsentState] = useState<AnalyticsConsent | null>(null)

  useEffect(() => {
    setConsentState(getStoredConsent())
    // Sync si le choix change ailleurs (ex: bannière encore montée)
    function handleChange(event: Event) {
      setConsentState((event as CustomEvent<AnalyticsConsent>).detail)
    }
    window.addEventListener(CONSENT_CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handleChange)
  }, [])

  const enabled = consent === 'granted'

  function handleToggle() {
    const next: AnalyticsConsent = enabled ? 'denied' : 'granted'
    setConsent(next)
    setConsentState(next)
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="font-medium">Mesures d&apos;audience</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Autoriser PostHog (hébergé en Europe) à mesurer l&apos;usage du site pour améliorer le
          produit. Modifiable à tout moment — effet immédiat.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Mesures d'audience"
        onClick={handleToggle}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          enabled ? 'bg-[var(--primary)]' : 'bg-input',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
