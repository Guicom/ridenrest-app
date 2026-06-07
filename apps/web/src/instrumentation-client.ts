// PostHog web SDK init — Next.js 15 instrumentation-client pattern (story posthog-1).
// RGPD : opt-out par défaut — AUCUNE collecte (cookie/localStorage) avant opt-in explicite
// via la bannière de consentement (consent-banner.tsx) ou le toggle Paramètres.
// Le session replay est désactivé explicitement ici — activation en posthog-3 (masquage carte requis).
import posthog from 'posthog-js'
import { setAnalyticsClient } from '@ridenrest/analytics'
import { getStoredConsent } from './lib/analytics-consent'

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
    // Replay JAMAIS auto : démarré explicitement ci-dessous si consentement,
    // et par setConsent() lors d'un opt-in via bannière/toggle (story posthog-3)
    disable_session_recording: true,
    // Masquage global des inputs dans les replays (RGPD) — le masquage carte
    // se fait par classe ph-no-capture sur les conteneurs MapLibre
    session_recording: {
      maskAllInputs: true,
    },
  })

  // Session replay gated consentement (story posthog-3) : au boot, ne démarre
  // que si l'utilisateur a explicitement consenti (clé localStorage posthog-1)
  if (getStoredConsent() === 'granted') {
    posthog.startSessionRecording()
  }

  // Transport web de la façade @ridenrest/analytics (story posthog-2).
  // Sans clé, aucun client n'est branché → helpers no-ops (comportement dev historique).
  setAnalyticsClient({ capture: (event, properties) => posthog.capture(event, properties) })

  // Feature flags — pattern de démonstration (story posthog-4) : lecture du flag
  // demo-rollout via le callback onFeatureFlags (recommandé : les flags arrivent en
  // async après l'init). Usage anodin, visible en dev uniquement — aucun impact produit.
  // Pattern de consommation documenté dans packages/analytics/README.md (web + mobile).
  posthog.onFeatureFlags(() => {
    if (process.env.NODE_ENV === 'development') {
      console.info('[analytics] feature flag demo-rollout:', posthog.isFeatureEnabled('demo-rollout'))
    }
  })
}
