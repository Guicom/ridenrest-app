'use client'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { useMapStore } from '@/stores/map.store'
import { OsmAttribution } from '@/components/shared/osm-attribution'
import { usePoiLayers } from '@/hooks/use-poi-layers'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi, MapLayer } from '@ridenrest/shared'
import type maplibregl from 'maplibre-gl'

// OpenFreeMap tile styles — MIT, commercial ok, OSM attribution required
const TILE_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const

// Trace colors — distinguishable in both themes
const SEGMENT_COLORS = ['#E44C26', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6']
const SEGMENT_JOIN_COLOR = '#6B7280'

interface MapCanvasProps {
  segments: MapSegmentData[]
  adventureName: string
  poisByLayer: Record<MapLayer, Poi[]>
}

export function MapCanvas({ segments, adventureName, poisByLayer }: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [styleVersion, setStyleVersion] = useState(0)
  const { resolvedTheme } = useTheme()
  const { setViewport } = useMapStore()

  usePoiLayers(mapRef, poisByLayer, styleVersion)

  // Init MapLibre map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let map: maplibregl.Map
    let cancelled = false  // Guard against unmount before dynamic import resolves

    // Dynamic import — MapLibre GL JS is browser-only, no SSR
    import('maplibre-gl').then((maplibreglModule) => {
      if (cancelled) return  // Component unmounted before import resolved — bail out
      map = new maplibreglModule.Map({
        container: mapContainerRef.current!,
        style: resolvedTheme === 'dark' ? TILE_STYLES.dark : TILE_STYLES.light,
        center: [2.3522, 46.2276],  // France fallback center
        zoom: 5,
        attributionControl: false,  // Disabled — using <OsmAttribution /> React component
      })
      mapRef.current = map

      map.on('load', () => {
        addTraceLayers(map, segments)
        fitToTrace(map, segments)

        // Sync viewport to store
        map.on('moveend', () => {
          const center = map.getCenter()
          setViewport(map.getZoom(), [center.lat, center.lng])
        })
      })
    })

    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // Init once — segments and theme changes handled by separate effects

  // Update trace when segments change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    updateTraceLayers(map, segments)
  }, [segments])

  // Theme switching — update map style without reloading the page (AC #3)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const newStyle = resolvedTheme === 'dark' ? TILE_STYLES.dark : TILE_STYLES.light
    map.setStyle(newStyle)
    // Re-add layers after style change (MapLibre resets layers on setStyle)
    // 'segments' intentionally captured from outer closure — updateTraceLayers effect
    // will reconcile any delta if segments changed between theme switch and style.load
    map.once('style.load', () => {
      addTraceLayers(map, segments)
      setStyleVersion((v) => v + 1)  // Triggers usePoiLayers re-run after theme change
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme])

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" aria-label={`Carte de l'aventure ${adventureName}`} role="application" />
      <OsmAttribution />
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildGeoJsonFeatures(segments: MapSegmentData[]) {
  return segments
    .filter((s) => s.waypoints && s.waypoints.length >= 2)
    .map((segment, idx) => ({
      type: 'Feature' as const,
      properties: {
        segmentId: segment.id,
        segmentIndex: idx,
        color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: segment.waypoints!.map((wp) => [wp.lng, wp.lat]),
      },
    }))
}

function buildJoinPoints(segments: MapSegmentData[]): GeoJSON.Feature[] {
  const points: GeoJSON.Feature[] = []
  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i]
    const last = current.waypoints?.[current.waypoints.length - 1]
    if (last) {
      points.push({
        type: 'Feature',
        properties: { type: 'join' },
        geometry: { type: 'Point', coordinates: [last.lng, last.lat] },
      })
    }
  }
  return points
}

function addTraceLayers(map: maplibregl.Map, segments: MapSegmentData[]) {
  const lineFeatures = buildGeoJsonFeatures(segments)
  const joinFeatures = buildJoinPoints(segments)

  map.addSource('trace', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: lineFeatures },
  })

  map.addLayer({
    id: 'trace-line',
    type: 'line',
    source: 'trace',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 3,
      'line-opacity': 0.9,
    },
  })

  if (joinFeatures.length > 0) {
    map.addSource('trace-joins', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: joinFeatures },
    })
    map.addLayer({
      id: 'trace-joins-circle',
      type: 'circle',
      source: 'trace-joins',
      paint: {
        'circle-radius': 5,
        'circle-color': SEGMENT_JOIN_COLOR,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
  }
}

function updateTraceLayers(map: maplibregl.Map, segments: MapSegmentData[]) {
  const source = map.getSource('trace') as maplibregl.GeoJSONSource | undefined
  if (!source) {
    addTraceLayers(map, segments)
    return
  }
  source.setData({
    type: 'FeatureCollection',
    features: buildGeoJsonFeatures(segments),
  })
  const joinFeatures = buildJoinPoints(segments)
  const joinSource = map.getSource('trace-joins') as maplibregl.GeoJSONSource | undefined
  if (joinSource) {
    joinSource.setData({ type: 'FeatureCollection', features: joinFeatures })
  } else if (joinFeatures.length > 0) {
    // Source didn't exist on mount (e.g., started with 1 segment) — create it now
    map.addSource('trace-joins', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: joinFeatures },
    })
    map.addLayer({
      id: 'trace-joins-circle',
      type: 'circle',
      source: 'trace-joins',
      paint: {
        'circle-radius': 5,
        'circle-color': SEGMENT_JOIN_COLOR,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
  }
}

function fitToTrace(map: maplibregl.Map, segments: MapSegmentData[]) {
  const allBounds = segments
    .filter((s) => s.boundingBox !== null)
    .map((s) => s.boundingBox!)

  if (allBounds.length === 0) return

  const minLat = Math.min(...allBounds.map((b) => b.minLat))
  const maxLat = Math.max(...allBounds.map((b) => b.maxLat))
  const minLng = Math.min(...allBounds.map((b) => b.minLng))
  const maxLng = Math.max(...allBounds.map((b) => b.maxLng))

  map.fitBounds(
    [[minLng, minLat], [maxLng, maxLat]],
    { padding: 40, maxZoom: 14, animate: false },
  )
}
