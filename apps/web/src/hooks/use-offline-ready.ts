import { useNetworkStatus } from './use-network-status'

export function useOfflineGate() {
  const { isOnline } = useNetworkStatus()
  return {
    isOnline,
    disabledReason: isOnline ? null : 'Fonctionnalité disponible en ligne',
  }
}
