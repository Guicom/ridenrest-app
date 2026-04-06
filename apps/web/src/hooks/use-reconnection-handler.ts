import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useNetworkStatus } from './use-network-status'

/**
 * Watches for offline→online transitions and:
 * 1. Refetches all active TanStack Query queries
 * 2. Shows a "Connexion rétablie" toast (3s auto-dismiss)
 *
 * Mount this once in the app layout — not in individual components.
 */
export function useReconnectionHandler() {
  const { isOnline } = useNetworkStatus()
  const wasOfflineRef = useRef(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true
      return
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false
      void queryClient.refetchQueries({ type: 'active' })
      toast.success('Connexion rétablie', { duration: 3000 })
    }
    return () => {
      // React Strict Mode safety — reset ref on cleanup
      wasOfflineRef.current = false
    }
  }, [isOnline, queryClient])
}
