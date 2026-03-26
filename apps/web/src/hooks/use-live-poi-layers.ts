import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useMapStore } from '@/stores/map.store'
import { CATEGORY_TO_LAYER } from '@ridenrest/shared'
import { POI_PIN_COLOR } from './use-poi-layers'
import type { Poi, MapLayer } from '@ridenrest/shared'
import type maplibregl from 'maplibre-gl'

const LAYER_ICONS: Record<MapLayer, string> = {
  accommodations: '🏨',
  restaurants:    '🍽',
  supplies:       '🛒',
  bike:           '🚲',
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
  const selectedPoiId = useMapStore((s) => s.selectedPoiId)

  // Main effect — creates/updates layers when POI data or map readiness changes
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
      const iconLayerId = `${sourceId}-icons`
      const ringLayerId = `${sourceId}-selected-ring`

      const layerPois = poisByLayer[layer]
      const features: GeoJSON.Feature[] = layerPois.map((poi) => ({
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
            'circle-color': POI_PIN_COLOR,
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
            'circle-radius': 8,
            'circle-color': POI_PIN_COLOR,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 1.5,
          },
        }, beforeLayer)

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
        }, beforeLayer)

        // Selected ring — initially hidden
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
        useMapStore.getState().setSelectedPoiId(props.id)
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

  // Separate effect — updates selected pin visual state reactively
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const id = selectedPoiId ?? '___none___'
    const radiusExpr = ['case', ['==', ['get', 'id'], selectedPoiId ?? ''], 9.6, 8] as unknown

    for (const layer of ALL_LAYERS) {
      const sourceId = `live-pois-${layer}`
      const pointLayerId = `${sourceId}-points`
      const ringLayerId = `${sourceId}-selected-ring`

      if (map.getLayer(pointLayerId)) {
        map.setPaintProperty(pointLayerId, 'circle-radius', radiusExpr)
      }
      if (map.getLayer(ringLayerId)) {
        map.setFilter(ringLayerId, ['==', ['get', 'id'], id])
      }
    }
  }, [mapRef, selectedPoiId, mapReady])
}
