import { useEffect, useRef } from 'react'
import { useMapStore } from '@/stores/map.store'
import { useUIStore } from '@/stores/ui.store'
import type { Poi, MapLayer } from '@ridenrest/shared'
import type maplibregl from 'maplibre-gl'

// Unified POI pin color — dark forest green (= --poi-pin token = --text-primary)
export const POI_PIN_COLOR = '#1A2D22'

// Category icons shown as white text on each pin
const LAYER_ICONS: Record<MapLayer, string> = {
  accommodations: '🏨',
  restaurants:    '🍽',
  supplies:       '🛒',
  bike:           '🚲',
}

const CLUSTER_MAX_ZOOM = 13
const CLUSTER_RADIUS = 50

const ALL_LAYERS: MapLayer[] = ['accommodations', 'restaurants', 'supplies', 'bike']

export function usePoiLayers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  poisByLayer: Record<MapLayer, Poi[]>,
  styleVersion: number,  // Forces re-run after theme/style change
  selectedStageColor: string | null = null,
) {
  const { visibleLayers, activeAccommodationTypes, selectedPoiId } = useMapStore()

  // Ref keeps selectedStageColor current for the main effect without adding it to deps
  // (avoids unnecessary setData calls on stage selection — reactive stroke effect handles updates)
  const selectedStageColorRef = useRef(selectedStageColor)
  selectedStageColorRef.current = selectedStageColor

  // Main effect — creates/updates layers when data, visibility, or style version changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Track per-layer click/cursor handlers so we can remove them on cleanup
    const cleanupFns: Array<() => void> = []

    for (const layer of ALL_LAYERS) {
      const sourceId = `pois-${layer}`
      const clusterLayerId = `${sourceId}-clusters`
      const clusterCountId = `${sourceId}-cluster-count`
      const pointLayerId = `${sourceId}-points`
      const iconLayerId = `${sourceId}-icons`
      const ringLayerId = `${sourceId}-selected-ring`

      if (!visibleLayers.has(layer)) {
        // Remove existing layers + source if they exist
        if (map.getLayer(iconLayerId)) map.removeLayer(iconLayerId)
        if (map.getLayer(ringLayerId)) map.removeLayer(ringLayerId)
        if (map.getLayer(clusterCountId)) map.removeLayer(clusterCountId)
        if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId)
        if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
        continue
      }

      // Client-side sub-type filter for accommodations (Story 8.4)
      const rawPois = poisByLayer[layer]
      const pois = layer === 'accommodations'
        ? rawPois.filter((poi) => activeAccommodationTypes.has(poi.category))
        : rawPois
      const features: GeoJSON.Feature[] = pois.map((poi) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
        properties: {
          id: poi.id,
          externalId: poi.externalId,
          name: poi.name,
          category: poi.category,
          categoryIcon: LAYER_ICONS[layer],
        },
      }))

      if (map.getSource(sourceId)) {
        // Update existing source data — layers persist
        ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features,
        })
      } else {
        // Add new clustered source + all layers
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: CLUSTER_RADIUS,
        })

        // Cluster circle layer — unified color
        map.addLayer({
          id: clusterLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': POI_PIN_COLOR,
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
            'circle-opacity': 0.8,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
          },
        })

        // Cluster count label
        map.addLayer({
          id: clusterCountId,
          type: 'symbol',
          source: sourceId,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 12,
          },
          paint: { 'text-color': '#ffffff' },
        })

        // Individual pin circle layer
        map.addLayer({
          id: pointLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 8,
            'circle-color': POI_PIN_COLOR,
            'circle-stroke-color': selectedStageColorRef.current ?? '#FFFFFF',
            'circle-stroke-width': 1.5,
          },
        })

        // White category icon text on top of each pin
        map.addLayer({
          id: iconLayerId,
          type: 'symbol',
          source: sourceId,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'text-field': ['get', 'categoryIcon'],
            'text-size': 10,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: { 'text-color': '#FFFFFF' },
        })

        // Selected ring — initially hidden (filter matches no real ID)
        map.addLayer({
          id: ringLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['==', ['get', 'id'], '___none___'],
          paint: {
            'circle-radius': 13,
            'circle-color': 'transparent',
            'circle-stroke-color': '#2D6A4A',
            'circle-stroke-width': 2,
            'circle-opacity': 0,
            'circle-stroke-opacity': 1,
          },
        })
      }

      // Event handlers — registered every render (outside if/else) so they survive source updates
      const handleClusterClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return
        const geometry = e.features[0].geometry as GeoJSON.Point
        map.flyTo({ center: geometry.coordinates as [number, number], zoom: map.getZoom() + 2 })
      }
      const handleClusterMouseEnter = () => { map.getCanvas().style.cursor = 'pointer' }
      const handleClusterMouseLeave = () => { map.getCanvas().style.cursor = '' }

      map.on('click', clusterLayerId, handleClusterClick)
      map.on('mouseenter', clusterLayerId, handleClusterMouseEnter)
      map.on('mouseleave', clusterLayerId, handleClusterMouseLeave)

      // POI pin click → open detail sheet + select pin
      const handlePoiClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return
        const props = e.features[0].properties as { id: string }
        useUIStore.getState().setSelectedPoi(props.id)
        useMapStore.getState().setSelectedPoiId(props.id)
        e.preventDefault()
      }
      const handlePoiMouseEnter = () => { map.getCanvas().style.cursor = 'pointer' }
      const handlePoiMouseLeave = () => { map.getCanvas().style.cursor = '' }

      map.on('click', pointLayerId, handlePoiClick)
      map.on('mouseenter', pointLayerId, handlePoiMouseEnter)
      map.on('mouseleave', pointLayerId, handlePoiMouseLeave)

      cleanupFns.push(() => {
        map.off('click', clusterLayerId, handleClusterClick)
        map.off('mouseenter', clusterLayerId, handleClusterMouseEnter)
        map.off('mouseleave', clusterLayerId, handleClusterMouseLeave)
        map.off('click', pointLayerId, handlePoiClick)
        map.off('mouseenter', pointLayerId, handlePoiMouseEnter)
        map.off('mouseleave', pointLayerId, handlePoiMouseLeave)
      })
    }

    return () => {
      cleanupFns.forEach((fn) => fn())
    }
  }, [mapRef, poisByLayer, visibleLayers, activeAccommodationTypes, styleVersion])

  // Separate effect — updates selected pin visual state reactively without re-creating layers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const id = selectedPoiId ?? '___none___'
    const radiusExpr = ['case', ['==', ['get', 'id'], selectedPoiId ?? ''], 9.6, 8] as unknown

    for (const layer of ALL_LAYERS) {
      const sourceId = `pois-${layer}`
      const pointLayerId = `${sourceId}-points`
      const ringLayerId = `${sourceId}-selected-ring`

      if (map.getLayer(pointLayerId)) {
        map.setPaintProperty(pointLayerId, 'circle-radius', radiusExpr)
      }
      if (map.getLayer(ringLayerId)) {
        map.setFilter(ringLayerId, ['==', ['get', 'id'], id])
      }
    }
  }, [mapRef, selectedPoiId, styleVersion])

  // Separate effect — updates POI pin stroke color reactively when stage selection changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const strokeColor = selectedStageColor ?? '#FFFFFF'
    for (const layer of ALL_LAYERS) {
      const pointLayerId = `pois-${layer}-points`
      if (map.getLayer(pointLayerId)) {
        map.setPaintProperty(pointLayerId, 'circle-stroke-color', strokeColor)
      }
    }
  }, [mapRef, selectedStageColor, styleVersion])
}
