import { create } from 'zustand'
import type { MapLayer } from '@ridenrest/shared'
import type { WeatherDimension } from '@/app/(app)/map/[id]/_components/weather-layer'

export type { MapLayer }

interface MapState {
  // Layer visibility
  activeLayer: MapLayer | null
  visibleLayers: Set<MapLayer>

  // Map viewport
  zoom: number
  center: [number, number] | null // [lat, lng]

  // Search range
  fromKm: number
  toKm: number

  // Density colorization toggle
  densityColorEnabled: boolean

  // Weather state
  weatherActive: boolean
  weatherDimension: WeatherDimension

  // Actions
  setActiveLayer: (layer: MapLayer | null) => void
  toggleLayer: (layer: MapLayer) => void
  setViewport: (zoom: number, center: [number, number]) => void
  setSearchRange: (fromKm: number, toKm: number) => void
  toggleDensityColor: () => void
  setWeatherActive: (active: boolean) => void
  setWeatherDimension: (dimension: WeatherDimension) => void
}

export const useMapStore = create<MapState>((set) => ({
  activeLayer: null,
  visibleLayers: new Set(),
  zoom: 10,
  center: null,
  fromKm: 0,
  toKm: 30,
  densityColorEnabled: true,
  weatherActive: false,
  weatherDimension: 'temperature',

  setActiveLayer: (layer) => set({ activeLayer: layer }),

  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.visibleLayers)
      if (next.has(layer)) {
        next.delete(layer)
      } else {
        next.add(layer)
      }
      return { visibleLayers: next }
    }),

  setViewport: (zoom, center) => set({ zoom, center }),

  setSearchRange: (fromKm, toKm) => set({ fromKm, toKm }),

  toggleDensityColor: () => set((state) => ({ densityColorEnabled: !state.densityColorEnabled })),

  setWeatherActive: (active) => set({ weatherActive: active }),

  setWeatherDimension: (dimension) => set({ weatherDimension: dimension }),
}))
