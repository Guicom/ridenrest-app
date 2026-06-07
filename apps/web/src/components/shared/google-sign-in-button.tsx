'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { trackSignupStarted } from '@ridenrest/analytics'

/**
 * Marqueur sessionStorage posé avant le redirect OAuth (survit au retour,
 * même onglet) — lu par <PostAuthTracker /> dans le layout (app) pour émettre
 * signup_completed ou login_completed (method=google) selon la fraîcheur du compte.
 * La valeur encode le chemin d'entrée pour le backfill de signup_started :
 * - 'google-register' : signup_started déjà émis au clic (page /register)
 * - 'google' : rien d'émis au clic (page /login) — PostAuthTracker backfille
 *   signup_started si le compte s'avère fraîchement créé (Google crée le
 *   compte même depuis /login, sans passer par /register).
 */
export const AUTH_FLOW_MARKER_KEY = 'rnr_auth_flow'

interface GoogleSignInButtonProps {
  callbackURL?: string
  /** Contexte d'usage pour le funnel acquisition : 'register' émet signup_started (method=google). */
  flow?: 'login' | 'register'
}

export function GoogleSignInButton({ callbackURL = '/adventures', flow }: GoogleSignInButtonProps) {
  const [isPending, setIsPending] = useState(false)

  const handleGoogleSignIn = async () => {
    setIsPending(true)
    // Funnel acquisition : le flow OAuth redirige hors domaine — on émet le
    // "started" avant la redirection, et on pose le marqueur que PostAuthTracker
    // résoudra au retour en signup_completed/login_completed (method=google)
    if (flow === 'register') {
      trackSignupStarted({ method: 'google' })
    }
    try {
      window.sessionStorage.setItem(AUTH_FLOW_MARKER_KEY, flow === 'register' ? 'google-register' : 'google')
    } catch {
      // sessionStorage indisponible — la complétion google ne sera pas émise (non bloquant)
    }
    try {
      // Initiates redirect flow: user → Google → back to callbackURL
      // On cancel: Better Auth redirects back to the app (current page)
      // Note: on success, redirect happens before the await resolves
      await authClient.signIn.social({
        provider: 'google',
        callbackURL,
      })
    } catch {
      // Network error or Better Auth server unavailable — reset so user can retry
      setIsPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full py-6"
      disabled={isPending}
      onClick={handleGoogleSignIn}
    >
      {isPending ? (
        'Redirection...'
      ) : (
        <>
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuer avec Google
        </>
      )}
    </Button>
  )
}
