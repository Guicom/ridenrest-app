'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getStoredConsent, setConsent } from '@/lib/analytics-consent'

/**
 * Bannière de consentement analytics (RGPD) — story posthog-1.
 *
 * Montée dans le root layout : couvre les route groups (marketing) ET (app).
 * Visible uniquement si aucun choix n'est persisté (clé localStorage
 * rnr_analytics_consent). Le choix s'applique immédiatement à PostHog
 * (opt_in_capturing / opt_out_capturing) — aucune collecte avant opt-in.
 */
export function ConsentBanner() {
  // null = pas encore monté (SSR-safe) ; ensuite true/false selon le choix persisté
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(getStoredConsent() === null)
  }, [])

  if (!visible) return null

  function handleChoice(granted: boolean) {
    setConsent(granted ? 'granted' : 'denied')
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Consentement aux mesures d'audience"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur-sm p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Ride&apos;n&apos;Rest utilise des mesures d&apos;audience (PostHog, hébergé en Europe) pour
          améliorer le produit. Aucune donnée n&apos;est collectée sans votre accord.{' '}
          <Link href="/mentions-legales" className="underline underline-offset-2 hover:text-foreground">
            En savoir plus
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="lg" onClick={() => handleChoice(false)}>
            Refuser
          </Button>
          <Button size="lg" onClick={() => handleChoice(true)}>
            Accepter
          </Button>
        </div>
      </div>
    </div>
  )
}
