// PostHog web SDK init — Next.js 15 instrumentation-client pattern (story posthog-1).
// RGPD : opt-out par défaut — AUCUNE collecte (cookie/localStorage) avant opt-in explicite
// via la bannière de consentement (consent-banner.tsx) ou le toggle Paramètres.
// Le session replay est désactivé explicitement ici — activation en posthog-3 (masquage carte requis).
import posthog from 'posthog-js'
import { setAnalyticsClient } from '@ridenrest/analytics'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    // Reverse proxy Next.js anti-adblock (rewrites /phrelay/* → eu.i.posthog.com, cf. next.config.ts)
    api_host: '/phrelay',
    // Cloud EU — liens vers l'UI PostHog (toolbar, etc.)
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-01-30',
    opt_out_capturing_by_default: true,
    capture_pageview: true,
    disable_session_recording: true,
  })

  // Transport web de la façade @ridenrest/analytics (story posthog-2).
  // Sans clé, aucun client n'est branché → helpers no-ops (comportement dev historique).
  setAnalyticsClient({ capture: (event, properties) => posthog.capture(event, properties) })
}
