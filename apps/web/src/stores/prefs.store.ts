import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MapStyleId } from '@/lib/map-styles'

interface PrefsState {
  mapStyle: MapStyleId
  setMapStyle: (style: MapStyleId) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      mapStyle: 'liberty',
      setMapStyle: (style) => set({ mapStyle: style }),
    }),
    { name: 'ridenrest-prefs' },
  ),
)
