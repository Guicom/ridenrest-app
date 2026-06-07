'use client'

import { useEffect } from 'react'
import { useSession } from '@/lib/auth/client'
import { trackSignupStarted, trackSignupCompleted, trackLoginCompleted } from '@ridenrest/analytics'
import { AUTH_FLOW_MARKER_KEY } from '@/components/shared/google-sign-in-button'

/**
 * Résolution post-OAuth du funnel acquisition (method=google).
 *
 * Le flow Google quitte le domaine avant qu'on puisse confirmer la complétion
 * côté formulaire. Le bouton Google pose un marqueur sessionStorage avant le
 * redirect ; au retour (layout (app), session chargée), ce composant lit le
 * marqueur et distingue :
 * - compte créé il y a < 5 min (Better Auth user.createdAt) → signup_completed
 * - compte plus ancien → login_completed
 *
 * Backfill signup_started : Google crée le compte même depuis /login (sans
 * passer par /register), où le clic n'émet pas signup_started. Si le compte
 * est frais et que le marqueur vient du chemin login ('google'), on émet
 * signup_started juste avant signup_completed pour garder le funnel ordonné
 * cohérent ($pageview → landing_cta_clicked → signup_started → signup_completed).
 * Le chemin register ('google-register') a déjà émis started au clic — pas de
 * backfill, sinon double comptage.
 *
 * Les flows email n'utilisent PAS ce mécanisme (events émis directement par
 * les formulaires) — le marqueur n'est posé que par le bouton Google.
 */
const SIGNUP_FRESHNESS_MS = 5 * 60 * 1000

export function PostAuthTracker() {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const userCreatedAt = session?.user?.createdAt

  useEffect(() => {
    if (!userId) return

    let marker: string | null = null
    try {
      marker = window.sessionStorage.getItem(AUTH_FLOW_MARKER_KEY)
    } catch {
      return
    }
    if (marker !== 'google' && marker !== 'google-register') return

    // Consommer le marqueur d'abord — garantit une émission unique par retour OAuth
    try {
      window.sessionStorage.removeItem(AUTH_FLOW_MARKER_KEY)
    } catch {
      // ignore
    }

    const createdAtMs = userCreatedAt ? new Date(userCreatedAt).getTime() : NaN
    const isFreshAccount = Number.isFinite(createdAtMs) && Date.now() - createdAtMs < SIGNUP_FRESHNESS_MS

    if (isFreshAccount) {
      // Chemin login : signup_started n'a pas pu être émis au clic (on ignorait
      // que ce serait une inscription) — backfill juste avant la complétion
      if (marker === 'google') {
        trackSignupStarted({ method: 'google' })
      }
      trackSignupCompleted({ method: 'google' })
    } else {
      trackLoginCompleted({ method: 'google' })
    }
  }, [userId, userCreatedAt])

  return null
}
