import AsyncStorage from '@react-native-async-storage/async-storage'
import { useColorScheme as useNativewindColorScheme } from 'nativewind'
import { useCallback, useEffect, useState } from 'react'

/**
 * Thème mobile — équivalent natif de `next-themes` (web) :
 *  - préférence utilisateur persistée (`AsyncStorage`),
 *  - fallback système via `useColorScheme()` NativeWind (`'system'`),
 *  - défaut = système (palette « Charbon » mirorée depuis le web en dark).
 *
 * Expose la palette active (`colorScheme`), la préférence brute (`preference`),
 * un setter persistant (`setPreference`) et un `toggle` light/dark.
 */
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'ridenrest.color-scheme'

function isPreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function useColorScheme() {
  const { colorScheme, setColorScheme } = useNativewindColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [hydrated, setHydrated] = useState(false)

  // Hydratation : applique la préférence stockée (ou suit le système).
  useEffect(() => {
    let active = true
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return
        const pref: ThemePreference = isPreference(stored) ? stored : 'system'
        setPreferenceState(pref)
        setColorScheme(pref)
      })
      .catch(() => setColorScheme('system'))
      .finally(() => {
        if (active) setHydrated(true)
      })
    return () => {
      active = false
    }
  }, [setColorScheme])

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref)
      setColorScheme(pref)
      void AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {})
    },
    [setColorScheme],
  )

  const toggle = useCallback(() => {
    // `colorScheme` (NativeWind) peut être indéfini avant hydratation → on aligne
    // sur le fallback `'light'` exposé pour ne pas basculer à l'aveugle vers dark.
    const current = colorScheme ?? 'light'
    setPreference(current === 'dark' ? 'light' : 'dark')
  }, [colorScheme, setPreference])

  return {
    /** Palette effectivement appliquée. */
    colorScheme: colorScheme ?? 'light',
    /** Préférence utilisateur brute (peut valoir `'system'`). */
    preference,
    /** Définit + persiste la préférence (`'light' | 'dark' | 'system'`). */
    setPreference,
    /** Bascule rapide light ⇄ dark. */
    toggle,
    /** `true` une fois la préférence stockée lue. */
    hydrated,
  }
}
