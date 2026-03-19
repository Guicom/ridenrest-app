import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { CATEGORY_TO_LAYER } from '@ridenrest/shared'
import type { Poi, MapLayer } from '@ridenrest/shared'
import type maplibregl from 'maplibre-gl'

const LAYER_COLORS: Record<MapLayer, string> = {
  accommodations: '#3B82F6',
  restaurants:    '#EF4444',
  supplies:       '#10B981',
  bike:           '#F59E0B',
}

const ALL_LAYERS: MapLayer[] = ['accommodations', 'restaurants', 'supplies', 'bike']
const CLUSTER_MAX_ZOOM = 13
const CLUSTER_RADIUS = 50

/**
 * Renders POI pins on a MapLibre map for live mode.
 * Same visual pattern as usePoiLayers (planning mode) but without visibility toggles —
 * all layers are always visible in live mode.
 */
export function useLivePoiLayers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  pois: Poi[],
  mapReady: boolean,
) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Group POIs by layer
    const poisByLayer: Record<MapLayer, Poi[]> = {
      accommodations: [], restaurants: [], supplies: [], bike: [],
    }
    for (const poi of pois) {
      const layer = CATEGORY_TO_LAYER[poi.category]
      if (layer) poisByLayer[layer].push(poi)
    }

    const cleanupFns: Array<() => void> = []

    for (const layer of ALL_LAYERS) {
      const sourceId = `live-pois-${layer}`
      const clusterLayerId = `${sourceId}-clusters`
      const clusterCountId = `${sourceId}-cluster-count`
      const pointLayerId = `${sourceId}-points`
      const color = LAYER_COLORS[layer]

      const layerPois = poisByLayer[layer]
      const features: GeoJSON.Feature[] = layerPois.map((poi) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
        properties: { id: poi.id, externalId: poi.externalId, name: poi.name, category: poi.category },
      }))

      if (map.getSource(sourceId)) {
        ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features,
        })
      } else {
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: CLUSTER_RADIUS,
        })

        // Insert POI layers BEFORE target-dot so target marker renders on top
        const beforeLayer = map.getLayer('target-dot') ? 'target-dot' : undefined

        map.addLayer({
          id: clusterLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': color,
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
            'circle-opacity': 0.8,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
          },
        }, beforeLayer)

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
        }, beforeLayer)

        map.addLayer({
          id: pointLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': color,
            'circle-radius': 8,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
          },
        }, beforeLayer)
      }

      // Event handlers
      const handleClusterClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return
        const geometry = e.features[0].geometry as GeoJSON.Point
        map.flyTo({ center: geometry.coordinates as [number, number], zoom: map.getZoom() + 2 })
      }
      const handlePoiClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return
        const props = e.features[0].properties as { id: string }
        useUIStore.getState().setSelectedPoi(props.id)
        e.preventDefault()
      }
      const setCursor = () => { map.getCanvas().style.cursor = 'pointer' }
      const resetCursor = () => { map.getCanvas().style.cursor = '' }

      map.on('click', clusterLayerId, handleClusterClick)
      map.on('mouseenter', clusterLayerId, setCursor)
      map.on('mouseleave', clusterLayerId, resetCursor)
      map.on('click', pointLayerId, handlePoiClick)
      map.on('mouseenter', pointLayerId, setCursor)
      map.on('mouseleave', pointLayerId, resetCursor)

      cleanupFns.push(() => {
        map.off('click', clusterLayerId, handleClusterClick)
        map.off('mouseenter', clusterLayerId, setCursor)
        map.off('mouseleave', clusterLayerId, resetCursor)
        map.off('click', pointLayerId, handlePoiClick)
        map.off('mouseenter', pointLayerId, setCursor)
        map.off('mouseleave', pointLayerId, resetCursor)
      })
    }

    return () => { cleanupFns.forEach((fn) => fn()) }
  }, [mapRef, pois, mapReady])
}
