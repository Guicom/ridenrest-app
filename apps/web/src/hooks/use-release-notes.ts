'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'ridenrest:last-seen-version'

export function useReleaseNotes() {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'

  const [showReleaseNotes, setShowReleaseNotes] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === null) {
        // First visit — initialize silently, no popup
        localStorage.setItem(STORAGE_KEY, appVersion)
      } else if (stored !== appVersion) {
        setShowReleaseNotes(true)
      }
    } catch {
      // localStorage indisponible (mode privé, quota) — on ignore silencieusement
    }
  }, [appVersion])

  const dismissReleaseNotes = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, appVersion)
    } catch {
      // ignore
    }
    setShowReleaseNotes(false)
  }, [appVersion])

  return { showReleaseNotes, dismissReleaseNotes }
}
