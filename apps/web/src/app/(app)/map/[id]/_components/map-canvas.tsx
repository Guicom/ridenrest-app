'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import { useMapStore } from '@/stores/map.store'
import { usePrefsStore } from '@/stores/prefs.store'
import { MAP_STYLES } from '@/lib/map-styles'
import { findPointAtKm } from '@ridenrest/gpx'
import { OsmAttribution } from '@/components/shared/osm-attribution'
import { usePoiLayers } from '@/hooks/use-poi-layers'
import { WeatherLayer, LINE_COLOR_EXPRESSIONS } from './weather-layer'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi, MapLayer, CoverageGapSummary, DensityStatus, WeatherPoint, MapWaypoint } from '@ridenrest/shared'

export interface SegmentWeatherData {
  segmentId: string
  weatherPoints: WeatherPoint[]
  waypoints: MapWaypoint[]
}
import type maplibregl from 'maplibre-gl'
import type { AdventureStageResponse } from '@ridenrest/shared'

const DENSITY_COLORS = {
  critical: '#dc2626', // var(--density-low)
  medium: '#d97706',   // var(--density-medium)
  none: '#16a34a',     // var(--density-high)
} as const

// Stores density event handler references per map instance for proper cleanup
const densityEventHandlers = new WeakMap<object, {
  click: (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => void
  mouseenter: () => void
  mouseleave: () => void
}>()

// Stores trace click event handler references per map instance for proper cleanup
const traceClickHandlers = new WeakMap<object, {
  click: (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => void
  mapClick: () => void
  mouseenter: () => void
  mouseleave: () => void
}>()

// Trace color — uniform brand green for all segments (C8)
const TRACE_COLOR = '#2D6A4A'

export interface MapCanvasHandle {
  /** Update the crosshair marker position directly — no React re-render */
  updateCrosshair: (km: number | null) => void
  /** Expose MapLibre map instance for coordinate projection etc. */
  getMap: () => maplibregl.Map | null
  /** Re-fit map to full adventure trace with animation (Story 16.3) */
  resetZoom: () => void
  /** Fit map to search corridor range with animation (Story 16.3) */
  fitToCorridorRange: (fromKm: number, toKm: number, segments: MapSegmentData[]) => void
}

interface MapCanvasProps {
  segments: MapSegmentData[]
  adventureName: string
  poisByLayer: Record<MapLayer, Poi[]>
  coverageGaps?: CoverageGapSummary[]
  densityStatus?: DensityStatus
  segmentsWeather?: SegmentWeatherData[]
  allWaypoints?: MapWaypoint[] | null
  stages?: AdventureStageResponse[]
  stageClickMode?: boolean
  onStageClick?: (endKm: number) => void
  onStageDragEnd?: (stageId: string, newEndKm: number) => void
  onStageHoverKm?: (distKm: number | null) => void
  onStageDragHoverKm?: (stageId: string | null, distKm: number | null) => void
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { segments, adventureName, poisByLayer, coverageGaps, densityStatus, segmentsWeather, allWaypoints, stages = [], stageClickMode = false, onStageClick, onStageDragEnd, onStageHoverKm, onStageDragHoverKm },
  ref,
) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const crosshairMarkerRef = useRef<maplibregl.Marker | null>(null)
  // Keep allWaypoints current without re-creating the imperative handle
  const allWaypointsRef = useRef(allWaypoints)
  useEffect(() => { allWaypointsRef.current = allWaypoints }, [allWaypoints])
  // Cache the Marker class after first import so crosshair updates are fully synchronous
  const MarkerClassRef = useRef<typeof maplibregl.Marker | null>(null)
  const [styleVersion, setStyleVersion] = useState(0)
  const mapStyle = usePrefsStore((s) => s.mapStyle)
  const styleUrl = MAP_STYLES.find((s) => s.id === mapStyle)?.url ?? MAP_STYLES[0].url
  const { setViewport, fromKm, toKm, densityColorEnabled, weatherActive, weatherDimension, searchRangeInteracted, selectedStageId } = useMapStore()

  // Refs for stale-closure-safe access inside event handlers and theme effects
  const densityStatusRef = useRef(densityStatus)
  const coverageGapsRef = useRef(coverageGaps)
  const densityColorEnabledRef = useRef(densityColorEnabled)
  const segmentsRef = useRef(segments)
  const stageClickModeRef = useRef(stageClickMode)
  const onStageClickRef = useRef(onStageClick)
  const stagesRef = useRef(stages)
  const onStageDragEndRef = useRef(onStageDragEnd)
  const onStageHoverKmRef = useRef(onStageHoverKm)
  const onStageDragHoverKmRef = useRef(onStageDragHoverKm)
  useEffect(() => { densityStatusRef.current = densityStatus }, [densityStatus])
  useEffect(() => { coverageGapsRef.current = coverageGaps }, [coverageGaps])
  useEffect(() => { densityColorEnabledRef.current = densityColorEnabled }, [densityColorEnabled])
  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { stageClickModeRef.current = stageClickMode }, [stageClickMode])
  useEffect(() => { onStageClickRef.current = onStageClick }, [onStageClick])
  useEffect(() => { stagesRef.current = stages }, [stages])
  useEffect(() => { onStageDragEndRef.current = onStageDragEnd }, [onStageDragEnd])
  useEffect(() => { onStageHoverKmRef.current = onStageHoverKm }, [onStageHoverKm])
  useEffect(() => { onStageDragHoverKmRef.current = onStageDragHoverKm }, [onStageDragHoverKm])

  // Centralized dimension update: fires for all weather layers together so none are missed.
  // React runs child effects (WeatherLayer data effect) before parent effects, so layers
  // are guaranteed to exist by the time this runs.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !segmentsWeather?.length) return
    for (const sw of segmentsWeather) {
      const layerLines = `weather-lines-layer-${sw.segmentId}`
      const layerArrows = `weather-wind-arrows-layer-${sw.segmentId}`
      if (map.getLayer(layerLines)) {
        map.setPaintProperty(layerLines, 'line-color', LINE_COLOR_EXPRESSIONS[weatherDimension])
      }
      if (map.getLayer(layerArrows)) {
        map.setLayoutProperty(layerArrows, 'visibility', weatherDimension === 'wind' ? 'visible' : 'none')
      }
    }
  }, [weatherDimension, segmentsWeather])

  const selectedStageColor = stages.find((s) => s.id === selectedStageId)?.color ?? null
  usePoiLayers(mapRef, poisByLayer, styleVersion, selectedStageColor)

  // Init MapLibre map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let map: maplibregl.Map
    let cancelled = false  // Guard against unmount before dynamic import resolves

    // Dynamic import — MapLibre GL JS is browser-only, no SSR
    import('maplibre-gl').then((maplibreglModule) => {
      if (cancelled) return  // Component unmounted before import resolved — bail out
      MarkerClassRef.current = maplibreglModule.Marker  // Cache for synchronous crosshair updates
      map = new maplibreglModule.Map({
        container: mapContainerRef.current!,
        style: styleUrl,
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

        // Trigger effects that guard on map.getSource('trace') (stages, corridor, etc.)
        // so cached data renders correctly on page refresh
        setStyleVersion((v) => v + 1)

        // Sync viewport to store
        map.on('moveend', () => {
          const center = map.getCenter()
          setViewport(map.getZoom(), [center.lat, center.lng])
        })
      })
    })

    return () => {
      cancelled = true
      markerRef.current?.remove()
      markerRef.current = null
      crosshairMarkerRef.current?.remove()
      crosshairMarkerRef.current = null
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // Init once — segments and theme changes handled by separate effects

  // Update trace when segments change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('trace')) return
    updateTraceLayers(map, segments)
  }, [segments])

  // Corridor highlight — update when fromKm/toKm, segments, or interaction state change
  useEffect(() => {
    const map = mapRef.current
    // isStyleLoaded() stays false while tiles load in background — check trace source instead
    if (!map || !map.getSource('trace')) return
    updateCorridorHighlight(map, segments, fromKm, toKm, searchRangeInteracted)
  }, [segments, fromKm, toKm, styleVersion, searchRangeInteracted])  // styleVersion triggers re-add after theme switch

  // Search-start marker — show a dot at fromKm when user has interacted (C7)
  useEffect(() => {
    if (!searchRangeInteracted || !allWaypoints || allWaypoints.length === 0) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    const kmWaypoints = allWaypoints.map((wp) => ({
      lat: wp.lat, lng: wp.lng, elevM: wp.ele ?? undefined, km: wp.distKm,
    }))
    const pos = findPointAtKm(kmWaypoints, fromKm)
    if (!pos) return
    import('maplibre-gl').then(({ Marker }) => {
      const map = mapRef.current
      if (!map) return
      if (!markerRef.current) {
        const el = createSearchStartMarker()
        markerRef.current = new Marker({ element: el }).setLngLat([pos.lng, pos.lat]).addTo(map)
      } else {
        markerRef.current.setLngLat([pos.lng, pos.lat])
      }
    })
    return () => { /* cleanup handled on next run */ }
  }, [fromKm, allWaypoints, searchRangeInteracted])

  // Density layer — show/hide based on densityStatus, coverageGaps, and styleVersion
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('trace')) return

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
      if (!map || !map.getSource('trace')) return
      if (state.densityColorEnabled && densityStatusRef.current === 'success' && coverageGapsRef.current) {
        addDensityLayer(map, segmentsRef.current, coverageGapsRef.current)
      } else {
        removeDensityLayer(map)
      }
    })
    return () => unsubscribe()
  }, [])  // Subscribe once — uses refs for latest values

  // Stage click mode — cursor + map click + mousemove preview handler
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const canvas = map.getCanvas()
    canvas.style.cursor = stageClickMode ? 'crosshair' : ''

    if (!stageClickMode) return

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      if (!stageClickModeRef.current) return
      const { lat, lng } = e.lngLat
      const waypoints = allWaypointsRef.current
      if (!waypoints || waypoints.length === 0) return

      // Find nearest waypoint by Haversine to click position
      let nearest = waypoints[0]
      let minDist = Infinity
      for (const wp of waypoints) {
        const dLat = (wp.lat - lat) * (Math.PI / 180)
        const dLng = (wp.lng - lng) * (Math.PI / 180)
        const dist = dLat * dLat + dLng * dLng // approx squared distance (sufficient for nearest neighbor)
        if (dist < minDist) { minDist = dist; nearest = wp }
      }

      onStageClickRef.current?.(nearest.distKm)
    }

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const waypoints = allWaypointsRef.current
      if (!waypoints || waypoints.length === 0) return
      const { lat, lng } = e.lngLat
      const nearest = waypoints.reduce((best, wp) => {
        const d = (wp.lat - lat) ** 2 + (wp.lng - lng) ** 2
        const dBest = (best.lat - lat) ** 2 + (best.lng - lng) ** 2
        return d < dBest ? wp : best
      })
      onStageHoverKmRef.current?.(nearest.distKm)
    }

    const handleMouseOut = () => onStageHoverKmRef.current?.(null)

    map.on('click', handleMapClick)
    map.on('mousemove', handleMouseMove)
    map.on('mouseout', handleMouseOut)
    return () => {
      map.off('click', handleMapClick)
      map.off('mousemove', handleMouseMove)
      map.off('mouseout', handleMouseOut)
      map.getCanvas().style.cursor = ''
    }
  }, [stageClickMode])  // Re-attach when click mode changes

  // Stage segments (colored trace) and markers — update when stages or styleVersion change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('trace')) return
    updateStageLayers(map, stagesRef.current, allWaypointsRef.current ?? [])
    renderStageMarkers(map, stagesRef.current, allWaypointsRef.current ?? [], MarkerClassRef.current, onStageDragEndRef, onStageDragHoverKmRef)
  }, [stages, styleVersion])

  // Trace click-to-search CTA — register handlers after map/style loads (Story 16.3)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('trace')) return

    // Remove previous handlers (re-registered on style change via styleVersion)
    const existingHandlers = traceClickHandlers.get(map)
    if (existingHandlers) {
      map.off('click', 'trace-line-click-target', existingHandlers.click)
      map.off('click', existingHandlers.mapClick)
      map.off('mouseenter', 'trace-line-click-target', existingHandlers.mouseenter)
      map.off('mouseleave', 'trace-line-click-target', existingHandlers.mouseleave)
      traceClickHandlers.delete(map)
    }

    // Flag: set to true when the trace-line layer was clicked, reset in mapClickHandler
    let traceClickedThisEvent = false

    const clickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (stageClickModeRef.current) return  // stage placement active — disable trace CTA
      traceClickedThisEvent = true
      const { lat, lng } = e.lngLat
      const waypoints = allWaypointsRef.current
      if (!waypoints || waypoints.length === 0) return
      let nearest = waypoints[0]
      let minDist = Infinity
      for (const wp of waypoints) {
        const d = (wp.lat - lat) ** 2 + (wp.lng - lng) ** 2
        if (d < minDist) { minDist = d; nearest = wp }
      }
      if (nearest) {
        useMapStore.getState().setTraceClickedKm(nearest.distKm)
      }
    }
    // Fires for every map click (after layer-specific handlers). If the trace was not clicked,
    // close the CTA so clicking anywhere outside the panel closes it (AC #3).
    const mapClickHandler = () => {
      if (!stageClickModeRef.current && !traceClickedThisEvent) {
        useMapStore.getState().setTraceClickedKm(null)
      }
      traceClickedThisEvent = false
    }
    const mouseenterHandler = () => { map.getCanvas().style.cursor = 'crosshair' }
    // M1 fix: only reset cursor if stage click mode is not active, to avoid
    // overriding the 'crosshair' cursor set by the stageClickMode effect.
    const mouseleaveHandler = () => {
      if (!stageClickModeRef.current) map.getCanvas().style.cursor = ''
    }

    traceClickHandlers.set(map, { click: clickHandler, mapClick: mapClickHandler, mouseenter: mouseenterHandler, mouseleave: mouseleaveHandler })
    map.on('click', 'trace-line-click-target', clickHandler)
    map.on('click', mapClickHandler)
    map.on('mouseenter', 'trace-line-click-target', mouseenterHandler)
    map.on('mouseleave', 'trace-line-click-target', mouseleaveHandler)

    return () => {
      const handlers = traceClickHandlers.get(map)
      if (handlers) {
        map.off('click', 'trace-line-click-target', handlers.click)
        map.off('click', handlers.mapClick)
        map.off('mouseenter', 'trace-line-click-target', handlers.mouseenter)
        map.off('mouseleave', 'trace-line-click-target', handlers.mouseleave)
        traceClickHandlers.delete(map)
      }
      useMapStore.getState().setTraceClickedKm(null)
    }
  }, [styleVersion])  // Re-register after style change

  // Imperative crosshair handle — bypasses React state/render cycle entirely for zero-latency updates
  useImperativeHandle(ref, () => ({
    updateCrosshair(km: number | null) {
      const map = mapRef.current
      const waypoints = allWaypointsRef.current

      if (km === null || !waypoints?.length || !map) {
        crosshairMarkerRef.current?.remove()
        crosshairMarkerRef.current = null
        return
      }

      const nearest = waypoints.reduce((a, b) =>
        Math.abs(b.distKm - km) < Math.abs(a.distKm - km) ? b : a,
      )

      if (!MarkerClassRef.current) return

      if (!crosshairMarkerRef.current) {
        const el = createCrosshairMarker()
        crosshairMarkerRef.current = new MarkerClassRef.current({ element: el })
          .setLngLat([nearest.lng, nearest.lat])
          .addTo(map)
      } else {
        crosshairMarkerRef.current.setLngLat([nearest.lng, nearest.lat])
      }
    },
    getMap() {
      return mapRef.current
    },
    resetZoom() {
      const map = mapRef.current
      if (!map) return
      fitToTrace(map, segmentsRef.current, true)
    },
    fitToCorridorRange(fromKm: number, toKm: number, segments: MapSegmentData[]) {
      const map = mapRef.current
      if (!map) return

      const inRange: Array<{ lat: number; lng: number }> = []
      for (const segment of segments) {
        if (!segment.waypoints) continue
        const segStart = segment.cumulativeStartKm
        const segEnd = segStart + segment.distanceKm
        if (toKm <= segStart || fromKm >= segEnd) continue
        const localFrom = Math.max(0, fromKm - segStart)
        const localTo = Math.min(segment.distanceKm, toKm - segStart)
        const filtered = segment.waypoints.filter(
          (wp) => wp.distKm >= localFrom && wp.distKm <= localTo,
        )
        inRange.push(...filtered)
      }

      if (inRange.length === 0) {
        fitToTrace(map, segments, true)
        return
      }

      const lats = inRange.map((wp) => wp.lat)
      const lngs = inRange.map((wp) => wp.lng)
      const minLat = Math.min(...lats)
      const maxLat = Math.max(...lats)
      const minLng = Math.min(...lngs)
      const maxLng = Math.max(...lngs)

      const dLat = Math.max(maxLat - minLat, 0.001)
      const dLng = Math.max(maxLng - minLng, 0.001)

      map.fitBounds(
        [[minLng - dLng * 0.1, minLat - dLat * 0.1], [maxLng + dLng * 0.1, maxLat + dLat * 0.1]],
        { padding: 60, maxZoom: 16, animate: true, duration: 600 },
      )
    },
  }), []) // Stable handle — accesses latest values via refs

  // Map style switching — update tiles when user changes style in prefs (AC #6)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(styleUrl)
    // Re-add layers after style change (MapLibre resets layers on setStyle)
    map.once('styledata', () => {
      addTraceLayers(map, segments)
      // Re-add density layer if active (use refs for stale-closure-safe access)
      if (densityStatusRef.current === 'success' && coverageGapsRef.current && densityColorEnabledRef.current) {
        addDensityLayer(map, segments, coverageGapsRef.current)
      }
      setStyleVersion((v) => v + 1)  // Triggers usePoiLayers + density re-run after style change
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl])

  const hasStrava = segments.some((s) => s.source === 'strava')

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" aria-label={`Carte de l'aventure ${adventureName}`} role="application" />
      <OsmAttribution />
      {hasStrava && (
        <div className="absolute bottom-5 left-2 z-10 bg-white/80 dark:bg-black/60 px-1.5 py-0.5 rounded pointer-events-none select-none">
          <img src="/powered-by-strava.svg" alt="Powered by Strava" className="h-4" />
        </div>
      )}
      {weatherActive && segmentsWeather?.map((sw) => (
        <WeatherLayer
          key={sw.segmentId}
          map={mapRef.current}
          weatherPoints={sw.weatherPoints}
          segmentWaypoints={sw.waypoints}
          dimension={weatherDimension}
          id={sw.segmentId}
        />
      ))}
    </div>
  )
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildGeoJsonFeatures(segments: MapSegmentData[]) {
  return segments
    .filter((s) => s.waypoints && s.waypoints.length >= 2)
    .map((segment, idx) => ({
      type: 'Feature' as const,
      properties: {
        segmentId: segment.id,
        segmentIndex: idx,
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
      'line-color': TRACE_COLOR,
      'line-width': 3,
      'line-opacity': 0.9,
    },
  })

  // Invisible wider click-target layer for easier trace interaction (Story 16.3)
  map.addLayer({
    id: 'trace-line-click-target',
    type: 'line',
    source: 'trace',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': 'rgba(0,0,0,0)',
      'line-width': 16,
      'line-opacity': 0,
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
        'circle-color': TRACE_COLOR,
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
        'circle-color': TRACE_COLOR,
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
  show = true,
) {
  const features = show ? buildCorridorFeatures(segments, fromKm, toKm) : []
  const source = map.getSource('corridor') as maplibregl.GeoJSONSource | undefined

  if (source) {
    source.setData({ type: 'FeatureCollection', features })
    // Re-add layer if it was removed (e.g., style reset)
    if (!map.getLayer('corridor-highlight')) {
      map.addLayer({
        id: 'corridor-highlight',
        type: 'line',
        source: 'corridor',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3498db', 'line-width': 8, 'line-opacity': 0.9 },
      })
    }
    return
  }
  map.addSource('corridor', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  })

  map.addLayer({
    id: 'corridor-highlight',
    type: 'line',
    source: 'corridor',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#3498db',   // blue — no conflict with OSM orange roads
      'line-width': 8,
      'line-opacity': 0.9,
    },
  })
}

function createSearchStartMarker(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'width:12px;height:12px;border-radius:50%;background:var(--text-primary);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)'
  return el
}

function createCrosshairMarker(): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:relative;width:12px;height:12px'

  const pulse = document.createElement('div')
  pulse.style.cssText = 'position:absolute;width:12px;height:12px;border-radius:50%;background:#16a34a;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);animation:ping 1s cubic-bezier(0,0,0.2,1) infinite;opacity:0.75'

  const dot = document.createElement('div')
  dot.style.cssText = 'position:relative;width:12px;height:12px;border-radius:50%;background:#16a34a;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)'

  wrapper.appendChild(pulse)
  wrapper.appendChild(dot)

  // Inject keyframes if not already present
  if (!document.getElementById('crosshair-ping-style')) {
    const style = document.createElement('style')
    style.id = 'crosshair-ping-style'
    style.textContent = '@keyframes ping{75%,100%{transform:scale(2);opacity:0}}'
    document.head.appendChild(style)
  }

  return wrapper
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

// ── Stage layer helpers ───────────────────────────────────────────────────────

function updateStageLayers(
  map: maplibregl.Map,
  stages: AdventureStageResponse[],
  allWaypoints: MapWaypoint[],
) {
  // Remove all existing stage segment layers/sources
  for (const layer of [...map.getStyle().layers ?? []]) {
    if (layer.id.startsWith('stage-segment-')) {
      map.removeLayer(layer.id)
    }
  }
  const style = map.getStyle()
  if (style?.sources) {
    for (const sourceId of Object.keys(style.sources)) {
      if (sourceId.startsWith('stage-segment-')) {
        map.removeSource(sourceId)
      }
    }
  }

  if (stages.length === 0 || allWaypoints.length === 0) return

  for (const stage of stages) {
    const segmentWaypoints = allWaypoints.filter(
      (wp) => wp.distKm >= stage.startKm && wp.distKm <= stage.endKm,
    )
    if (segmentWaypoints.length < 2) continue

    const coordinates = segmentWaypoints.map((wp) => [wp.lng, wp.lat])
    const sourceId = `stage-segment-${stage.id}`
    const layerId = `stage-segment-${stage.id}`

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      },
    })

    // Insert above trace-line but below POI markers
    const beforeId = map.getLayer('trace-joins-circle') ? 'trace-joins-circle' : undefined
    map.addLayer(
      {
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': stage.color, 'line-width': 4 },
      },
      beforeId,
    )
  }
}

// Holds per-map stage marker elements for cleanup
const stageMarkerMap = new WeakMap<object, maplibregl.Marker[]>()

function renderStageMarkers(
  map: maplibregl.Map,
  stages: AdventureStageResponse[],
  allWaypoints: MapWaypoint[],
  MarkerClass: typeof maplibregl.Marker | null,
  onStageDragEndRef: RefObject<((stageId: string, newEndKm: number) => void) | undefined>,
  onStageDragHoverKmRef: RefObject<((stageId: string | null, distKm: number | null) => void) | undefined>,
) {
  if (!MarkerClass) return

  // Remove existing stage markers
  const prev = stageMarkerMap.get(map) ?? []
  for (const m of prev) m.remove()
  stageMarkerMap.set(map, [])

  if (stages.length === 0 || allWaypoints.length === 0) return

  // Inject box-shadow pulse styles once (no children needed — avoids layout interference with MapLibre positioning)
  if (!document.getElementById('stage-marker-hover-style')) {
    const style = document.createElement('style')
    style.id = 'stage-marker-hover-style'
    style.textContent = '@keyframes stage-pulse{0%{box-shadow:0 1px 3px rgba(0,0,0,.3),0 0 0 0 rgba(var(--scr),.6)}100%{box-shadow:0 1px 3px rgba(0,0,0,.3),0 0 0 10px rgba(var(--scr),0)}}.stage-marker:hover{animation:stage-pulse 1.1s ease-out infinite}'
    document.head.appendChild(style)
  }

  const newMarkers: maplibregl.Marker[] = []
  for (const stage of stages) {
    const nearest = allWaypoints.reduce((a, b) =>
      Math.abs(b.distKm - stage.endKm) < Math.abs(a.distKm - stage.endKm) ? b : a,
    )
    // Single flat div — same structure as original so MapLibre anchor works correctly
    const [r, g, b2] = [stage.color.slice(1,3), stage.color.slice(3,5), stage.color.slice(5,7)].map((h) => parseInt(h, 16))
    const el = document.createElement('div')
    el.className = 'stage-marker'
    el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${stage.color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:grab`
    el.style.setProperty('--scr', `${r},${g},${b2}`)
    el.setAttribute('data-stage-id', stage.id)
    // Change map canvas cursor on hover
    el.addEventListener('mouseenter', () => { map.getCanvas().style.cursor = 'grab' })
    el.addEventListener('mouseleave', () => { map.getCanvas().style.cursor = '' })
    const stageId = stage.id
    const marker = new MarkerClass({ element: el, anchor: 'center', draggable: true })
      .setLngLat([nearest.lng, nearest.lat])
      .addTo(map)
    const snapNearest = (lat: number, lng: number) => allWaypoints.reduce((best, wp) => {
      const d = (wp.lat - lat) ** 2 + (wp.lng - lng) ** 2
      const dBest = (best.lat - lat) ** 2 + (best.lng - lng) ** 2
      return d < dBest ? wp : best
    })
    marker.on('drag', () => {
      const { lat, lng } = marker.getLngLat()
      if (!allWaypoints.length) return
      onStageDragHoverKmRef.current?.(stageId, snapNearest(lat, lng).distKm)
    })
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat()
      if (!allWaypoints.length) return
      const snapped = snapNearest(lat, lng)
      onStageDragHoverKmRef.current?.(stageId, null)  // clear overlay
      onStageDragEndRef.current?.(stageId, snapped.distKm)
    })
    newMarkers.push(marker)
  }
  stageMarkerMap.set(map, newMarkers)
}

function fitToTrace(map: maplibregl.Map, segments: MapSegmentData[], animate = false) {
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
    { padding: 40, maxZoom: 14, animate },
  )
}
