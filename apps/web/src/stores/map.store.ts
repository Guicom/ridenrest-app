import { create } from 'zustand'
import type { MapLayer, PoiCategory } from '@ridenrest/shared'
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
  searchRangeInteracted: boolean

  // Density colorization toggle
  densityColorEnabled: boolean

  // Weather state
  weatherActive: boolean
  weatherDimension: WeatherDimension

  // Accommodation sub-type filter (Story 8.4)
  activeAccommodationTypes: Set<PoiCategory>

  // Selected POI pin state (Story 9.3)
  selectedPoiId: string | null

  // Actions
  setActiveLayer: (layer: MapLayer | null) => void
  toggleLayer: (layer: MapLayer) => void
  setViewport: (zoom: number, center: [number, number]) => void
  setSearchRange: (fromKm: number, toKm: number) => void
  toggleDensityColor: () => void
  setWeatherActive: (active: boolean) => void
  setWeatherDimension: (dimension: WeatherDimension) => void
  toggleAccommodationType: (type: PoiCategory) => void
  setSelectedPoiId: (id: string | null) => void
}

export const useMapStore = create<MapState>((set) => ({
  activeLayer: null,
  visibleLayers: new Set(['accommodations'] as MapLayer[]),
  zoom: 10,
  center: null,
  fromKm: 0,
  toKm: 30,
  searchRangeInteracted: false,
  densityColorEnabled: false,
  weatherActive: false,
  weatherDimension: 'temperature',
  activeAccommodationTypes: new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'] as PoiCategory[]),
  selectedPoiId: null,

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

  setSearchRange: (fromKm, toKm) => set({ fromKm, toKm, searchRangeInteracted: true }),

  toggleDensityColor: () => set((state) => ({ densityColorEnabled: !state.densityColorEnabled })),

  setWeatherActive: (active) => set({ weatherActive: active }),

  setWeatherDimension: (dimension) => set({ weatherDimension: dimension }),

  toggleAccommodationType: (type) =>
    set((state) => {
      const next = new Set(state.activeAccommodationTypes)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return { activeAccommodationTypes: next }
    }),

  setSelectedPoiId: (id) => set({ selectedPoiId: id }),
}))
