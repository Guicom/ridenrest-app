import { useEffect } from 'react'
import { useMapStore } from '@/stores/map.store'
import { useUIStore } from '@/stores/ui.store'
import type { Poi, MapLayer } from '@ridenrest/shared'
import type maplibregl from 'maplibre-gl'

// Category color map — matches LayerToggles active colors
const LAYER_COLORS: Record<MapLayer, string> = {
  accommodations: '#3B82F6',  // blue-500
  restaurants:    '#EF4444',  // red-500
  supplies:       '#10B981',  // green-500
  bike:           '#F59E0B',  // amber-500
}

const CLUSTER_MAX_ZOOM = 13
const CLUSTER_RADIUS = 50

export function usePoiLayers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  poisByLayer: Record<MapLayer, Poi[]>,
  styleVersion: number,  // Forces re-run after theme change
) {
  const { visibleLayers, activeAccommodationTypes } = useMapStore()

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const ALL_LAYERS: MapLayer[] = ['accommodations', 'restaurants', 'supplies', 'bike']

    // Track per-layer click/cursor handlers so we can remove them on cleanup
    const cleanupFns: Array<() => void> = []

    for (const layer of ALL_LAYERS) {
      const sourceId = `pois-${layer}`
      const clusterLayerId = `${sourceId}-clusters`
      const clusterCountId = `${sourceId}-cluster-count`
      const pointLayerId = `${sourceId}-points`
      const color = LAYER_COLORS[layer]

      if (!visibleLayers.has(layer)) {
        // Remove existing layers + source if they exist
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
        properties: { id: poi.id, externalId: poi.externalId, name: poi.name, category: poi.category },
      }))

      if (map.getSource(sourceId)) {
        // Update existing source data
        ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features,
        })
      } else {
        // Add new clustered source
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: CLUSTER_RADIUS,
        })

        // Cluster circle layer
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

        // Unclustered point layer
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
        })

      }

      // Event handlers registered every render (outside if/else) so they
      // survive source-data updates that re-run the effect without re-creating the source.
      const handleClusterClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return
        const feature = e.features[0]
        const geometry = feature.geometry as GeoJSON.Point
        map.flyTo({
          center: geometry.coordinates as [number, number],
          zoom: map.getZoom() + 2,
        })
      }
      const handleClusterMouseEnter = () => { map.getCanvas().style.cursor = 'pointer' }
      const handleClusterMouseLeave = () => { map.getCanvas().style.cursor = '' }

      map.on('click', clusterLayerId, handleClusterClick)
      map.on('mouseenter', clusterLayerId, handleClusterMouseEnter)
      map.on('mouseleave', clusterLayerId, handleClusterMouseLeave)

      // POI pin click → open detail sheet
      const handlePoiClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return
        const props = e.features[0].properties as { id: string }
        useUIStore.getState().setSelectedPoi(props.id)
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
}
