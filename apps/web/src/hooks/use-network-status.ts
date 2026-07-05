import { useEffect, useState } from 'react'

export function useNetworkStatus() {
  // Défaut SSR-safe `true` : le serveur n'a pas `navigator`, et lire `navigator.onLine`
  // dans l'initialiseur de `useState` provoque un mismatch d'hydratation (le 1er rendu
  // client doit être IDENTIQUE au HTML serveur). On lit l'état réseau réel APRÈS le
  // montage dans `useEffect` — un éventuel passage hors-ligne s'applique post-hydratation.
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Synchronise sur l'état réel une fois monté côté client (jamais pendant le rendu).
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline }
}
