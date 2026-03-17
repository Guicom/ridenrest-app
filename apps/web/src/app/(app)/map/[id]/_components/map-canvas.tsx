'use client'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { useMapStore } from '@/stores/map.store'
import { OsmAttribution } from '@/components/shared/osm-attribution'
import { usePoiLayers } from '@/hooks/use-poi-layers'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi, MapLayer, CoverageGapSummary, DensityStatus } from '@ridenrest/shared'
import type maplibregl from 'maplibre-gl'

const DENSITY_COLORS = {
  critical: '#ef4444',
  medium: '#f59e0b',
  none: '#22c55e',
} as const

// Stores density event handler references per map instance for proper cleanup
const densityEventHandlers = new WeakMap<object, {
  click: (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => void
  mouseenter: () => void
  mouseleave: () => void
}>()

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
  coverageGaps?: CoverageGapSummary[]
  densityStatus?: DensityStatus
}

export function MapCanvas({ segments, adventureName, poisByLayer, coverageGaps, densityStatus }: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [styleVersion, setStyleVersion] = useState(0)
  const { resolvedTheme } = useTheme()
  const { setViewport, fromKm, toKm, densityColorEnabled } = useMapStore()

  // Refs for stale-closure-safe access inside event handlers and theme effects
  const densityStatusRef = useRef(densityStatus)
  const coverageGapsRef = useRef(coverageGaps)
  const densityColorEnabledRef = useRef(densityColorEnabled)
  const segmentsRef = useRef(segments)
  useEffect(() => { densityStatusRef.current = densityStatus }, [densityStatus])
  useEffect(() => { coverageGapsRef.current = coverageGaps }, [coverageGaps])
  useEffect(() => { densityColorEnabledRef.current = densityColorEnabled }, [densityColorEnabled])
  useEffect(() => { segmentsRef.current = segments }, [segments])

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

        // Add density layer immediately if already active (data was cached before map loaded)
        if (densityStatusRef.current === 'success' && coverageGapsRef.current && densityColorEnabledRef.current) {
          addDensityLayer(map, segments, coverageGapsRef.current)
        }

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

  // Corridor highlight — update when fromKm/toKm or segments change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    updateCorridorHighlight(map, segments, fromKm, toKm)
  }, [segments, fromKm, toKm, styleVersion])  // styleVersion triggers re-add after theme switch

  // Density layer — show/hide based on densityStatus, coverageGaps, and styleVersion
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (densityStatus === 'success' && densityColorEnabledRef.current && coverageGaps) {
      addDensityLayer(map, segments, coverageGaps)
    } else {
      removeDensityLayer(map)
    }
  }, [coverageGaps, densityStatus, segments, styleVersion])  // styleVersion triggers re-add after theme switch

  // Direct store subscription for densityColorEnabled toggle — bypasses React render cycle
  // to immediately update MapLibre when the toggle is clicked
  useEffect(() => {
    const unsubscribe = useMapStore.subscribe((state, prevState) => {
      if (state.densityColorEnabled === prevState.densityColorEnabled) return
      const map = mapRef.current
      if (!map || !map.isStyleLoaded()) return
      if (state.densityColorEnabled && densityStatusRef.current === 'success' && coverageGapsRef.current) {
        addDensityLayer(map, segmentsRef.current, coverageGapsRef.current)
      } else {
        removeDensityLayer(map)
      }
    })
    return () => unsubscribe()
  }, [])  // Subscribe once — uses refs for latest values

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
      // Re-add density layer if active (use refs for stale-closure-safe access)
      if (densityStatusRef.current === 'success' && coverageGapsRef.current && densityColorEnabledRef.current) {
        addDensityLayer(map, segments, coverageGapsRef.current)
      }
      setStyleVersion((v) => v + 1)  // Triggers usePoiLayers + density re-run after theme change
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

export function buildCorridorFeatures(
  segments: MapSegmentData[],
  fromKm: number,
  toKm: number,
): GeoJSON.Feature[] {
  return segments
    .filter((s) => s.waypoints)
    .flatMap((segment) => {
      const segStart = segment.cumulativeStartKm
      const segEnd = segStart + segment.distanceKm

      if (toKm <= segStart || fromKm >= segEnd) return []

      const localFrom = Math.max(0, fromKm - segStart)
      const localTo = Math.min(segment.distanceKm, toKm - segStart)

      const rangeWaypoints = segment.waypoints!.filter(
        (wp) => wp.distKm >= localFrom && wp.distKm <= localTo,
      )

      if (rangeWaypoints.length < 2) return []

      return [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: rangeWaypoints.map((wp) => [wp.lng, wp.lat]),
        },
      }]
    })
}

function updateCorridorHighlight(
  map: maplibregl.Map,
  segments: MapSegmentData[],
  fromKm: number,
  toKm: number,
) {
  const features = buildCorridorFeatures(segments, fromKm, toKm)
  const source = map.getSource('corridor') as maplibregl.GeoJSONSource | undefined

  if (source) {
    source.setData({ type: 'FeatureCollection', features })
    return
  }

  // Add corridor source + layer (rendered BELOW trace-line so trace stays on top)
  map.addSource('corridor', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  })

  const beforeId = map.getLayer('trace-line') ? 'trace-line' : undefined
  map.addLayer(
    {
      id: 'corridor-highlight',
      type: 'line',
      source: 'corridor',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#FBBF24',   // amber-400 — visible on both light/dark themes
        'line-width': 6,
        'line-opacity': 0.7,
      },
    },
    beforeId,
  )
}

// ── Density layer helpers ─────────────────────────────────────────────────────

export function buildDensityColoredFeatures(
  segments: MapSegmentData[],
  coverageGaps: CoverageGapSummary[],
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = []

  for (const segment of segments) {
    if (!segment.waypoints || segment.waypoints.length < 2) continue

    const totalKm = segment.distanceKm
    for (let fromKm = 0; fromKm < totalKm; fromKm += 10) {
      const toKm = Math.min(fromKm + 10, totalKm)

      const tronconWaypoints = segment.waypoints.filter(
        (wp) => wp.distKm >= fromKm && wp.distKm <= toKm,
      )

      if (tronconWaypoints.length < 2) continue

      // Epsilon comparison (< 0.01 km = 10m) to handle float32 DB values
      const gap = coverageGaps.find(
        (g) =>
          g.segmentId === segment.id &&
          Math.abs(g.fromKm - fromKm) < 0.01 &&
          Math.abs(g.toKm - toKm) < 0.01,
      )

      const severity = gap?.severity ?? 'none'
      const color = DENSITY_COLORS[severity]

      features.push({
        type: 'Feature',
        properties: {
          color,
          severity,
          fromKmAbsolute: segment.cumulativeStartKm + fromKm,
          toKmAbsolute: segment.cumulativeStartKm + toKm,
        },
        geometry: {
          type: 'LineString',
          coordinates: tronconWaypoints.map((wp) => [wp.lng, wp.lat]),
        },
      })
    }
  }

  return features
}

function addDensityLayer(
  map: maplibregl.Map,
  segments: MapSegmentData[],
  coverageGaps: CoverageGapSummary[],
) {
  const features = buildDensityColoredFeatures(segments, coverageGaps)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Remove existing density layer+source if present
  removeDensityLayer(map)

  map.addSource('trace-density', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  })

  // Insert below trace-joins-circle to preserve correct layer ordering per spec
  const beforeId = map.getLayer('trace-joins-circle') ? 'trace-joins-circle' : undefined
  map.addLayer(
    {
      id: 'trace-density-line',
      type: 'line',
      source: 'trace-density',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 4,
        'line-opacity': reducedMotion ? 0.9 : 0,
        'line-opacity-transition': { duration: reducedMotion ? 0 : 300, delay: 0 },
      },
    },
    beforeId,
  )

  if (!reducedMotion) {
    // Trigger opacity transition after layer is added
    requestAnimationFrame(() => {
      if (map.getLayer('trace-density-line')) {
        map.setPaintProperty('trace-density-line', 'line-opacity', 0.9)
      }
    })
  }

  // Hide original trace layer
  if (map.getLayer('trace-line')) {
    map.setLayoutProperty('trace-line', 'visibility', 'none')
  }

  // Store handler references so removeDensityLayer can clean them up (prevents accumulation)
  const clickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
    const feature = e.features?.[0]
    if (!feature?.properties) return
    const { fromKmAbsolute, toKmAbsolute } = feature.properties as {
      fromKmAbsolute: number
      toKmAbsolute: number
    }
    useMapStore.getState().setSearchRange(fromKmAbsolute, toKmAbsolute)
  }
  const mouseenterHandler = () => { map.getCanvas().style.cursor = 'pointer' }
  const mouseleaveHandler = () => { map.getCanvas().style.cursor = '' }

  densityEventHandlers.set(map, { click: clickHandler, mouseenter: mouseenterHandler, mouseleave: mouseleaveHandler })
  map.on('click', 'trace-density-line', clickHandler)
  map.on('mouseenter', 'trace-density-line', mouseenterHandler)
  map.on('mouseleave', 'trace-density-line', mouseleaveHandler)
}

function removeDensityLayer(map: maplibregl.Map) {
  // Remove event listeners first to prevent accumulation across repeated add/remove cycles
  const handlers = densityEventHandlers.get(map)
  if (handlers) {
    map.off('click', 'trace-density-line', handlers.click)
    map.off('mouseenter', 'trace-density-line', handlers.mouseenter)
    map.off('mouseleave', 'trace-density-line', handlers.mouseleave)
    densityEventHandlers.delete(map)
    map.getCanvas().style.cursor = ''
  }
  if (map.getLayer('trace-density-line')) {
    map.removeLayer('trace-density-line')
  }
  if (map.getSource('trace-density')) {
    map.removeSource('trace-density')
  }
  // Restore original trace layer
  if (map.getLayer('trace-line')) {
    map.setLayoutProperty('trace-line', 'visibility', 'visible')
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
