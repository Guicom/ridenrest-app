'use client'

import { useState, useTransition } from 'react'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { disconnectStrava } from '../actions'

interface StravaConnectionCardProps {
  isConnected: boolean
}

export function StravaConnectionCard({ isConnected }: StravaConnectionCardProps) {
  const [isPending, setIsPending] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)
  const [isDisconnecting, startDisconnect] = useTransition()

  const handleConnect = async () => {
    setIsPending(true)
    try {
      await authClient.oauth2.link({
        providerId: 'strava',
        callbackURL: '/settings',
      })
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
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Strava logo mark */}
          <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 4 13.828h4.17"
              fill="#FC4C02"
            />
          </svg>
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
          <Button
            variant="default"
            size="sm"
            onClick={handleConnect}
            disabled={isPending}
          >
            {isPending ? 'Redirection...' : 'Connecter Strava'}
          </Button>
        )}
      </div>

      {disconnectError && (
        <p className="text-sm text-destructive" role="alert">
          {disconnectError}
        </p>
      )}
    </div>
  )
}
