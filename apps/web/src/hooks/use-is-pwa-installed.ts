'use client'
import { useState, useEffect } from 'react'

function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- iOS Safari non-standard property
  if ((navigator as any).standalone === true) return true
  return false
}

export function useIsPwaInstalled(): boolean {
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    setInstalled(isPwaInstalled())
  }, [])

  return installed
}
