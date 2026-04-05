'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useLiveStore } from '@/stores/live.store'

const CONSENT_KEY = 'ridenrest:geoloc-consent'

export function useLiveMode() {
  const [hasConsented, setHasConsented] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem(CONSENT_KEY) === 'true'
      : false
  )
  const [permissionDenied, setPermissionDenied] = useState(false)

  const watchIdRef = useRef<number | null>(null)

  // Use store via getState() to avoid stale closures in callbacks
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) return
    // Guard: don't start a second watcher if one is already active
    if (watchIdRef.current !== null) return

    const onSuccess = (pos: GeolocationPosition) => {
      useLiveStore.getState().updateGpsPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      })
      useLiveStore.getState().activateLiveMode()
    }

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setPermissionDenied(true)
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
  }, [])

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      useLiveStore.getState().deactivateLiveMode()
    }
  }, [])

  const grantConsent = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'true')
    setHasConsented(true)
    useLiveStore.getState().setGeolocationConsent(true)
    startWatching()
  }, [startWatching])

  // Cleanup on unmount — ensures clearWatch fires on navigation (AC #4)
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
        useLiveStore.getState().deactivateLiveMode()
      }
    }
  }, [])

  return {
    isLiveModeActive: useLiveStore((s) => s.isLiveModeActive),
    hasConsented,
    permissionDenied,
    startWatching,
    stopWatching,
    grantConsent,
  }
}
