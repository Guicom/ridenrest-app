'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useTheme } from 'next-themes'
import { useLiveStore } from '@/stores/live.store'
import { useLivePoiLayers } from '@/hooks/use-live-poi-layers'
import { OsmAttribution } from '@/components/shared/osm-attribution'
import { findPointAtKm } from '@ridenrest/gpx'
import type { Poi, MapSegmentData } from '@ridenrest/shared'
import type { KmWaypoint } from '@ridenrest/gpx'
import type maplibregl from 'maplibre-gl'

const TILE_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const

const TRACE_COLOR = '#FFFFFF'

interface LiveMapCanvasProps {
  adventureId: string
  segments: MapSegmentData[]
  targetKm?: number | null
  pois?: Poi[]
}

export function LiveMapCanvas({ adventureId, segments, targetKm, pois = [] }: LiveMapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const segmentsRef = useRef(segments)
  const [mapReady, setMapReady] = useState(false)
  const { resolvedTheme } = useTheme()

  // Read GPS position reactively from store — triggers re-render on change
  const currentPosition = useLiveStore((s) => s.currentPosition)

  useEffect(() => { segmentsRef.current = segments }, [segments])

  // Init MapLibre map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let map: maplibregl.Map
    let cancelled = false

    import('maplibre-gl').then((maplibreglModule) => {
      if (cancelled) return
      map = new maplibreglModule.Map({
        container: mapContainerRef.current!,
        style: resolvedTheme === 'dark' ? TILE_STYLES.dark : TILE_STYLES.light,
        center: [2.3522, 46.2276],
        zoom: 5,
        attributionControl: false,
      })
      mapRef.current = map

      map.on('load', () => {
        addTraceLayers(map, segmentsRef.current)
        addTargetPointLayer(map)
        addGpsPositionLayer(map)
        fitToTrace(map, segmentsRef.current)
        setMapReady(true)
      })
    })

    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render POI pins on map
  useLivePoiLayers(mapRef, pois, mapReady)

  // Update trace when segments change AFTER map is ready
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || segments.length === 0) return

    const source = map.getSource('live-trace') as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData({ type: 'FeatureCollection', features: buildTraceFeatures(segments) })
      fitToTrace(map, segments)
    }
  }, [segments, mapReady])

  // Update GPS dot when position changes OR map becomes ready
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !currentPosition) return

    const source = map.getSource('live-gps-position') as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [currentPosition.lng, currentPosition.lat] },
        properties: {},
      })
    }

    map.panTo([currentPosition.lng, currentPosition.lat])
  }, [currentPosition, mapReady])

  // Compute waypoints in KmWaypoint format for findPointAtKm
  const kmWaypoints: KmWaypoint[] = useMemo(() => {
    const firstSeg = segments[0]
    if (!firstSeg?.waypoints) return []
    return firstSeg.waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng, km: wp.distKm }))
  }, [segments])

  // Update target point marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || targetKm == null || kmWaypoints.length === 0) return

    const point = findPointAtKm(kmWaypoints, targetKm)
    if (!point) return

    const source = map.getSource('live-target-point') as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
        properties: {},
      })
    }
  }, [targetKm, mapReady, kmWaypoints])

  return (
    <div className="relative h-full w-full">
      <div
        ref={mapContainerRef}
        className="h-full w-full"
        aria-label={`Carte Live — aventure ${adventureId}`}
        role="application"
      />
      <OsmAttribution />
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTraceFeatures(segments: MapSegmentData[]) {
  return segments
    .filter((s) => s.waypoints && s.waypoints.length >= 2)
    .map((segment) => ({
      type: 'Feature' as const,
      properties: { segmentId: segment.id },
      geometry: {
        type: 'LineString' as const,
        coordinates: segment.waypoints!.map((wp) => [wp.lng, wp.lat]),
      },
    }))
}

function addTraceLayers(map: maplibregl.Map, segments: MapSegmentData[]) {
  map.addSource('live-trace', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: buildTraceFeatures(segments) },
  })

  map.addLayer({
    id: 'live-trace-line',
    type: 'line',
    source: 'live-trace',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': TRACE_COLOR,
      'line-width': 3,
      'line-opacity': 0.9,
    },
  })
}

function addTargetPointLayer(map: maplibregl.Map) {
  map.addSource('live-target-point', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
  })

  map.addLayer({
    id: 'target-dot',
    type: 'circle',
    source: 'live-target-point',
    paint: {
      'circle-radius': 14,
      'circle-color': '#2D6A4A',
      'circle-opacity': 0.5,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-opacity': 0.8,
    },
  })
}

function addGpsPositionLayer(map: maplibregl.Map) {
  map.addSource('live-gps-position', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
  })

  map.addLayer({
    id: 'gps-dot',
    type: 'circle',
    source: 'live-gps-position',
    paint: {
      'circle-radius': 10,
      'circle-color': '#2D6A4A',
      'circle-opacity': 0.9,
      'circle-stroke-width': 3,
      'circle-stroke-color': '#FFFFFF',
    },
  })
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
