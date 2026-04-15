import { useEffect, useRef } from 'react'
import { useMapStore } from '@/stores/map.store'
import { useUIStore } from '@/stores/ui.store'
import { POI_CLUSTER_COLOR } from '@ridenrest/shared'
import { registerPoiPinImages, poiPinImageKey } from '@/lib/poi-pin-factory'
import type { Poi, MapLayer } from '@ridenrest/shared'
import type maplibregl from 'maplibre-gl'

const CLUSTER_MAX_ZOOM = 13
const CLUSTER_RADIUS = 50

const ALL_LAYERS: MapLayer[] = ['accommodations', 'restaurants', 'supplies', 'bike']

export function usePoiLayers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  poisByLayer: Record<MapLayer, Poi[]>,
  styleVersion: number,  // Forces re-run after theme/style change
  selectedStageColor: string | null = null,
) {
  const { visibleLayers, activeAccommodationTypes, activeRestaurantTypes, selectedPoiId } = useMapStore()

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
    let cancelled = false

    void registerPoiPinImages(map).then(() => {
      if (cancelled) return

      for (const layer of ALL_LAYERS) {
        const sourceId = `pois-${layer}`
        const clusterLayerId = `${sourceId}-clusters`
        const clusterCountId = `${sourceId}-cluster-count`
        const pointLayerId = `${sourceId}-points`
        const ringLayerId = `${sourceId}-selected-ring`

        if (!visibleLayers.has(layer)) {
          // Remove existing layers + source if they exist
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
          : layer === 'restaurants'
            ? rawPois.filter((poi) => activeRestaurantTypes.has(poi.category))
            : rawPois
        const features: GeoJSON.Feature[] = pois.map((poi) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
          properties: {
            id: poi.id,
            externalId: poi.externalId,
            name: poi.name,
            category: poi.category,
            iconImageKey: poiPinImageKey(poi.category),
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

          // Cluster circle layer — vert brand Ride'n'Rest, unifié tous layers
          map.addLayer({
            id: clusterLayerId,
            type: 'circle',
            source: sourceId,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': POI_CLUSTER_COLOR,
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

          // Individual pin symbol layer — SVG goutte colorée + icône
          map.addLayer({
            id: pointLayerId,
            type: 'symbol',
            source: sourceId,
            filter: ['!', ['has', 'point_count']],
            layout: {
              'icon-image': ['get', 'iconImageKey'],
              'icon-size': 1,
              'icon-anchor': 'bottom',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
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
              'circle-stroke-color': POI_CLUSTER_COLOR,
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
          const geometry = e.features[0].geometry as GeoJSON.Point
          // Pan map so the pin is slightly below viewport center — leaves room for the popup above
          map.easeTo({ center: geometry.coordinates as [number, number], offset: [0, 100], duration: 300 })
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
    })

    return () => {
      cancelled = true
      cleanupFns.forEach((fn) => fn())
    }
  }, [mapRef, poisByLayer, visibleLayers, activeAccommodationTypes, activeRestaurantTypes, styleVersion])

  // Separate effect — updates selected pin visual state reactively without re-creating layers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const id = selectedPoiId ?? '___none___'

    for (const layer of ALL_LAYERS) {
      const ringLayerId = `pois-${layer}-selected-ring`
      if (map.getLayer(ringLayerId)) {
        map.setFilter(ringLayerId, ['==', ['get', 'id'], id])
      }
    }
  }, [mapRef, selectedPoiId, styleVersion])
}
