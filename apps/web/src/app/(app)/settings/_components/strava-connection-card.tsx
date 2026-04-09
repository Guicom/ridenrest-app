'use client'

import { useState, useTransition } from 'react'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { disconnectStrava } from '../actions'
import { isStravaEnabled } from '@/lib/strava-config'

interface StravaConnectionCardProps {
  isConnected: boolean
}

export function StravaConnectionCard({ isConnected }: StravaConnectionCardProps) {
  const [isPending, setIsPending] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)
  const [isDisconnecting, startDisconnect] = useTransition()
  const stravaEnabled = isStravaEnabled()
  const connectDisabled = !stravaEnabled && !isConnected

  const handleConnect = async () => {
    setIsPending(true)
    try {
      await authClient.oauth2.link({
        providerId: 'strava',
        callbackURL: '/settings',
      })
    } catch {
      // Errors are non-fatal — button re-enables via finally
    } finally {
      // Reset in case redirect doesn't happen (error or unexpected resolution)
      setIsPending(false)
    }
  }

  const handleDisconnect = () => {
    setDisconnectError(null)
    startDisconnect(async () => {
      const result = await disconnectStrava()
      if (!result.success) {
        setDisconnectError(result.error ?? 'Erreur inattendue.')
      }
      // On success, page revalidates automatically (Server Action + revalidatePath)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="font-medium">Strava</p>
            <p className="text-sm text-muted-foreground">
              {isConnected ? 'Compte connecté' : 'Non connecté'}
            </p>
          </div>
        </div>

        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? 'Déconnexion...' : 'Déconnecter'}
          </Button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={isPending || connectDisabled}
            className={connectDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer disabled:opacity-70'}
          >
            <img src="/btn_strava_connect_with_white.svg" alt="Connect with Strava" className="h-12" />
          </button>
        )}
      </div>

      {connectDisabled && (
        <p className="text-xs text-muted-foreground">
          L&apos;intégration Strava est temporairement indisponible. L&apos;import GPX manuel reste disponible.
        </p>
      )}

      {disconnectError && (
        <p className="text-sm text-destructive" role="alert">
          {disconnectError}
        </p>
      )}
    </div>
  )
}
