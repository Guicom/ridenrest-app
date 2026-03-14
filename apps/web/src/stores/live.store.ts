import { create } from 'zustand'

// GPS position is NEVER sent to server (RGPD) — stored client-side only
interface LiveState {
  isLiveModeActive: boolean
  geolocationConsented: boolean
  // GPS — client-side only, never serialized or sent to API
  currentPosition: { lat: number; lng: number } | null
  currentKmOnRoute: number | null
  speedKmh: number // User-configured pace
  targetAheadKm: number // How far ahead to show POIs in live mode

  // Actions
  activateLiveMode: () => void
  deactivateLiveMode: () => void
  setGeolocationConsent: (consented: boolean) => void
  updateGpsPosition: (position: { lat: number; lng: number }) => void
  setCurrentKm: (km: number) => void
  setSpeedKmh: (speed: number) => void
  setTargetAheadKm: (km: number) => void
}

export const useLiveStore = create<LiveState>((set) => ({
  isLiveModeActive: false,
  geolocationConsented: false,
  currentPosition: null,
  currentKmOnRoute: null,
  speedKmh: 15, // Default cycling pace
  targetAheadKm: 30, // Default look-ahead distance

  activateLiveMode: () => set({ isLiveModeActive: true }),
  deactivateLiveMode: () =>
    set({ isLiveModeActive: false, currentPosition: null, currentKmOnRoute: null }),

  setGeolocationConsent: (consented) => set({ geolocationConsented: consented }),

  updateGpsPosition: (position) => set({ currentPosition: position }),

  setCurrentKm: (km) => set({ currentKmOnRoute: km }),
  setSpeedKmh: (speed) => set({ speedKmh: speed }),
  setTargetAheadKm: (km) => set({ targetAheadKm: km }),
}))
