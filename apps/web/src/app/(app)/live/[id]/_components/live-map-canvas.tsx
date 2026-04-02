'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useMemo } from 'react'
import { useLiveStore } from '@/stores/live.store'
import { useLivePoiLayers } from '@/hooks/use-live-poi-layers'
import { usePrefsStore } from '@/stores/prefs.store'
import { MAP_STYLES } from '@/lib/map-styles'
import { OsmAttribution } from '@/components/shared/osm-attribution'
import { findPointAtKm } from '@ridenrest/gpx'
import { WeatherLayer, LINE_COLOR_EXPRESSIONS, type WeatherDimension } from '@/app/(app)/map/[id]/_components/weather-layer'
import type { Poi, MapSegmentData, WeatherPoint, AdventureStageResponse } from '@ridenrest/shared'
import type { KmWaypoint } from '@ridenrest/gpx'
import type maplibregl from 'maplibre-gl'

const TRACE_COLOR = '#2D6A4A'

// Module-level Marker class — cached after first dynamic import so refs are never stale
let _cachedMarker: typeof maplibregl.Marker | null = null

export interface LiveMapCanvasHandle {
  getMap: () => maplibregl.Map | null
  resetZoom: () => void
  centerOnGps: () => void
}

interface LiveMapCanvasProps {
  adventureId: string
  segments: MapSegmentData[]
  targetKm?: number | null
  pois?: Poi[]
  weatherPoints?: WeatherPoint[]
  weatherDimension?: WeatherDimension
  weatherActive?: boolean
  searchTrigger?: number
  stages?: AdventureStageResponse[]
  stageLayerActive?: boolean
  currentKmOnRoute?: number | null
  onStageLongPress?: (stageId: string) => void
}

export const LiveMapCanvas = forwardRef<LiveMapCanvasHandle, LiveMapCanvasProps>(function LiveMapCanvas({ adventureId, segments, targetKm, pois = [], weatherPoints = [], weatherDimension = 'temperature', weatherActive = false, searchTrigger = 0, stages = [], stageLayerActive = false, currentKmOnRoute = null, onStageLongPress }: LiveMapCanvasProps, ref) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const segmentsRef = useRef(segments)
  const hasInitialZoomedRef = useRef(false)
  const currentPositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const kmWaypointsRef = useRef<KmWaypoint[]>([])
  const stagesRef = useRef(stages)
  const stageLayerActiveRef = useRef(stageLayerActive)
  const currentKmOnRouteRef = useRef(currentKmOnRoute)
  const onStageLongPressRef = useRef(onStageLongPress)
  const MarkerClassRef = useRef<typeof maplibregl.Marker | null>(null)

  // True once user has manually panned/zoomed — stops GPS auto-follow until centerOnGps() is called
  const userInteractedRef = useRef(false)

  const [mapReady, setMapReady] = useState(false)

  // User map style preference (persisted)
  const mapStyle = usePrefsStore((s) => s.mapStyle)
  const styleUrl = MAP_STYLES.find((s) => s.id === mapStyle)?.url ?? MAP_STYLES[0].url

  // Read GPS position reactively from store — triggers re-render on change
  const currentPosition = useLiveStore((s) => s.currentPosition)

  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { stagesRef.current = stages }, [stages])
  useEffect(() => { stageLayerActiveRef.current = stageLayerActive }, [stageLayerActive])
  useEffect(() => { currentKmOnRouteRef.current = currentKmOnRoute }, [currentKmOnRoute])
  useEffect(() => { onStageLongPressRef.current = onStageLongPress }, [onStageLongPress])

  // Init MapLibre map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let map: maplibregl.Map
    let cancelled = false

    import('maplibre-gl').then((maplibreglModule) => {
      if (cancelled) return
      _cachedMarker = maplibreglModule.Marker
      MarkerClassRef.current = maplibreglModule.Marker
      map = new maplibreglModule.Map({
        container: mapContainerRef.current!,
        style: styleUrl,
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
        updateLiveStageLayers(map, stagesRef.current, kmWaypointsRef.current, stageLayerActiveRef.current)
        updateLiveStageMarkers(map, stagesRef.current, kmWaypointsRef.current, currentKmOnRouteRef.current, stageLayerActiveRef.current, MarkerClassRef.current, (id) => onStageLongPressRef.current?.(id))
        setMapReady(true)
      })

      // Stop GPS auto-follow when user manually interacts with the map
      map.on('dragstart', () => { userInteractedRef.current = true })
      map.on('pitchstart', () => { userInteractedRef.current = true })
    })

    return () => {
      cancelled = true
      if (map) {
        const markers = liveStageMarkerMap.get(map) ?? []
        markers.forEach((m) => m.remove())
        liveStageMarkerMap.delete(map)
        map.remove()
      }
      mapRef.current = null
      hasInitialZoomedRef.current = false  // Reset so next mount triggers flyTo again
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render POI pins on map
  useLivePoiLayers(mapRef, pois, mapReady)

  // Style switching — when user changes map style in prefs
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(styleUrl)
    setMapReady(false)
    const onStyleLoad = () => {
      addTraceLayers(map, segmentsRef.current)
      addTargetPointLayer(map)
      addGpsPositionLayer(map)
      // Restore GPS position after style switch
      if (currentPositionRef.current) {
        updateGpsPositionLayer(map, currentPositionRef.current)
      }
      updateLiveStageLayers(map, stagesRef.current, kmWaypointsRef.current, stageLayerActiveRef.current)
      updateLiveStageMarkers(map, stagesRef.current, kmWaypointsRef.current, currentKmOnRouteRef.current, stageLayerActiveRef.current, MarkerClassRef.current, (id) => onStageLongPressRef.current?.(id))
      setMapReady(true)
    }
    map.once('styledata', onStyleLoad)
    return () => { map.off('styledata', onStyleLoad) }
  }, [styleUrl])

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

  // Update GPS position dot when position changes OR map becomes ready
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !currentPosition) return

    currentPositionRef.current = currentPosition
    updateGpsPositionLayer(map, currentPosition)

    // Lookahead offset from route bearing at current GPS position
    // Works even when stationary (uses route geometry, not GPS movement)
    const OFFSET_PX = 300
    let offsetY = 0
    if (kmWaypointsRef.current.length >= 2) {
      const bearingRad = routeBearingAtPosition(kmWaypointsRef.current, currentPosition)
      // cos(bearing): +1=north, -1=south, 0=east/west
      // positive offsetY → GPS below center (more ahead visible when going north)
      offsetY = Math.round(Math.cos(bearingRad) * OFFSET_PX)
    }

    if (!hasInitialZoomedRef.current) {
      hasInitialZoomedRef.current = true
      map.flyTo({ center: [currentPosition.lng, currentPosition.lat], zoom: 10, offset: [0, offsetY], duration: 1200 })
    } else if (!userInteractedRef.current) {
      map.easeTo({ center: [currentPosition.lng, currentPosition.lat], offset: [0, offsetY], duration: 400 })
    }
  }, [currentPosition, mapReady])

  // Compute waypoints in KmWaypoint format for findPointAtKm + route bearing
  // Use all segments with cumulative adjustment so stage.endKm (cumulative) maps correctly
  const kmWaypoints: KmWaypoint[] = useMemo(() => {
    return segments.flatMap((s) =>
      (s.waypoints ?? []).map((wp) => ({
        lat: wp.lat,
        lng: wp.lng,
        km: s.cumulativeStartKm + wp.distKm,
      }))
    )
  }, [segments])

  // Keep kmWaypointsRef in sync — used in GPS effect without re-triggering it
  useEffect(() => { kmWaypointsRef.current = kmWaypoints }, [kmWaypoints])

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

  // Update stage colored-trace layers when stages/active/waypoints change (NOT on GPS updates)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    try {
      updateLiveStageLayers(map, stages, kmWaypoints, stageLayerActive)
    } catch (e) {
      console.error('[LiveMapCanvas] updateLiveStageLayers error:', e)
    }
  }, [stages, stageLayerActive, mapReady, kmWaypoints])

  // Update stage markers when stages/active/waypoints/currentKm change (includes GPS updates)
  useEffect(() => {
    const map = mapRef.current
    const MarkerClass = MarkerClassRef.current ?? _cachedMarker
    if (!map || !mapReady) return
    try {
      updateLiveStageMarkers(map, stages, kmWaypoints, currentKmOnRoute, stageLayerActive, MarkerClass, (id) => onStageLongPressRef.current?.(id))
    } catch (e) {
      console.error('[LiveMapCanvas] updateLiveStageMarkers error:', e)
    }
  }, [stages, stageLayerActive, currentKmOnRoute, mapReady, kmWaypoints])

  // Zoom to target area when user clicks RECHERCHER
  useEffect(() => {
    if (searchTrigger === 0) return
    const map = mapRef.current
    if (!map || !mapReady || targetKm == null || kmWaypoints.length === 0) return
    const point = findPointAtKm(kmWaypoints, targetKm)
    if (!point) return
    userInteractedRef.current = true  // Prevent GPS from fighting the search flyTo
    map.flyTo({ center: [point.lng, point.lat], zoom: 13, duration: 800 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTrigger])

  // Centralized dimension update — same pattern as map-canvas.tsx in planning mode
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !weatherActive) return
    const layerLines = 'weather-lines-layer-live'
    const layerArrows = 'weather-wind-arrows-layer-live'
    if (map.getLayer(layerLines)) {
      map.setPaintProperty(layerLines, 'line-color', LINE_COLOR_EXPRESSIONS[weatherDimension])
    }
    if (map.getLayer(layerArrows)) {
      map.setLayoutProperty(layerArrows, 'visibility', weatherDimension === 'wind' ? 'visible' : 'none')
    }
  }, [weatherDimension, weatherActive, mapReady])

  // Segment waypoints for weather layer (MapWaypoint format)
  const segmentWaypoints = segments[0]?.waypoints ?? []

  const centerOnGps = useCallback(() => {
    const map = mapRef.current
    const pos = currentPositionRef.current
    if (!map || !pos) return
    userInteractedRef.current = false
    let offsetY = 0
    if (kmWaypointsRef.current.length >= 2) {
      const bearingRad = routeBearingAtPosition(kmWaypointsRef.current, pos)
      offsetY = Math.round(Math.cos(bearingRad) * 300)
    }
    map.flyTo({ center: [pos.lng, pos.lat], zoom: 14, offset: [0, offsetY], duration: 800 })
  }, [])

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    resetZoom: () => {
      if (!mapRef.current) return
      fitToTrace(mapRef.current, segmentsRef.current, true)
    },
    centerOnGps,
  }), [centerOnGps])

  return (
    <div className="relative h-full w-full">
      <div
        ref={mapContainerRef}
        className="h-full w-full"
        aria-label={`Carte Live — aventure ${adventureId}`}
        role="application"
      />
      <OsmAttribution />
      {mapReady && weatherActive && weatherPoints.length > 0 && segmentWaypoints.length > 0 && (
        <WeatherLayer
          map={mapRef.current}
          weatherPoints={weatherPoints}
          segmentWaypoints={segmentWaypoints}
          dimension={weatherDimension}
          id="live"
        />
      )}
    </div>
  )
})

// ── Live stage layers (colored trace segments) ───────────────────────────────

function updateLiveStageLayers(
  map: maplibregl.Map,
  stages: AdventureStageResponse[],
  kmWaypoints: KmWaypoint[],
  active: boolean,
) {
  // Remove all existing live stage segment layers/sources
  for (const layer of [...(map.getStyle().layers ?? [])]) {
    if (layer.id.startsWith('live-stage-segment-')) {
      map.removeLayer(layer.id)
    }
  }
  const style = map.getStyle()
  if (style?.sources) {
    for (const sourceId of Object.keys(style.sources)) {
      if (sourceId.startsWith('live-stage-segment-')) {
        map.removeSource(sourceId)
      }
    }
  }

  if (!active || stages.length === 0 || kmWaypoints.length === 0) return

  for (const stage of stages) {
    const segWps = kmWaypoints.filter((wp) => wp.km >= stage.startKm && wp.km <= stage.endKm)
    if (segWps.length < 2) continue

    const sourceId = `live-stage-segment-${stage.id}`
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: segWps.map((wp) => [wp.lng, wp.lat]) },
      },
    })
    // Insert above live-trace-line
    const beforeId = map.getLayer('target-dot') ? 'target-dot' : undefined
    map.addLayer(
      {
        id: sourceId,
        type: 'line',
        source: sourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': stage.color, 'line-width': 4 },
      },
      beforeId,
    )
  }
}

// ── Live stage markers ───────────────────────────────────────────────────────

// WeakMap keyed on the map instance — same cleanup pattern as map-canvas.tsx
const liveStageMarkerMap = new WeakMap<object, maplibregl.Marker[]>()

function updateLiveStageMarkers(
  map: maplibregl.Map,
  stages: AdventureStageResponse[],
  kmWaypoints: KmWaypoint[],
  currentKm: number | null,
  active: boolean,
  MarkerClass: typeof maplibregl.Marker | null,
  onLongPress: (stageId: string) => void,
) {
  // Remove previous markers
  const prev = liveStageMarkerMap.get(map) ?? []
  prev.forEach((m) => m.remove())
  liveStageMarkerMap.set(map, [])

  if (!active || stages.length === 0 || kmWaypoints.length === 0 || !MarkerClass) return

  const newMarkers: maplibregl.Marker[] = []
  for (const stage of stages) {
    const point = findPointAtKm(kmWaypoints, stage.endKm)
    if (!point) continue

    const isPassed = currentKm !== null && stage.endKm <= currentKm

    // Marker element — inline styles only (no Tailwind on DOM-created elements)
    // z-index required: MapLibre adds will-change:transform which promotes to compositing layer,
    // causing markers to render below the canvas on some mobile browsers (iOS Safari)
    const el = document.createElement('div')
    el.style.cssText = `position:relative;width:20px;height:20px;border-radius:50%;background:${stage.color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer;z-index:10`
    if (isPassed) {
      el.style.opacity = '0.4'
    }

    // Checkmark for passed stages
    if (isPassed) {
      const check = document.createElement('span')
      check.textContent = '✓'
      check.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px;color:white;line-height:1'
      el.appendChild(check)
    }

    // Name label
    const label = document.createElement('span')
    label.textContent = stage.name
    label.style.cssText = [
      'position:absolute',
      'bottom:-18px',
      'left:50%',
      'transform:translateX(-50%)',
      'font-size:10px',
      'font-weight:600',
      'white-space:nowrap',
      `color:${stage.color}`,
      'text-shadow:0 1px 2px rgba(255,255,255,0.9)',
    ].join(';')
    el.appendChild(label)

    // Long-press (touch) + right-click (desktop)
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    const stageId = stage.id
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return
      longPressTimer = setTimeout(() => { onLongPress(stageId) }, 500)
    })
    el.addEventListener('pointerup', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null } })
    el.addEventListener('pointermove', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null } })
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      onLongPress(stageId)
    })

    const marker = new MarkerClass({ element: el, anchor: 'center' })
      .setLngLat([point.lng, point.lat])
      .addTo(map)
    newMarkers.push(marker)
  }
  liveStageMarkerMap.set(map, newMarkers)
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
  if (map.getSource('live-trace')) return  // Guard against re-add after style switch

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
  if (map.getSource('live-target-point')) return  // Guard against re-add after style switch

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
  if (map.getSource('gps-position')) return  // Guard against re-add after style switch

  // Empty GeoJSON initially — populated when GPS fires
  const emptyPoint = { type: 'FeatureCollection' as const, features: [] }

  map.addSource('gps-position', { type: 'geojson', data: emptyPoint })

  // Halo ring
  map.addLayer({
    id: 'gps-halo',
    type: 'circle',
    source: 'gps-position',
    paint: {
      'circle-radius': 14,
      'circle-color': '#2D6A4A',
      'circle-opacity': 0.25,
      'circle-stroke-width': 0,
    },
  })

  // Solid dot
  map.addLayer({
    id: 'gps-dot',
    type: 'circle',
    source: 'gps-position',
    paint: {
      'circle-radius': 8,
      'circle-color': '#2D6A4A',
      'circle-opacity': 1,
      'circle-stroke-width': 3,
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-opacity': 1,
    },
  })
}

function updateGpsPositionLayer(map: maplibregl.Map, position: { lat: number; lng: number }) {
  const source = map.getSource('gps-position') as maplibregl.GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
    properties: {},
  })
}


// Returns bearing in radians from north (clockwise) at the closest waypoint to `position`.
// Uses route geometry → works when stationary, unlike GPS-movement-based bearing.
function routeBearingAtPosition(waypoints: KmWaypoint[], position: { lat: number; lng: number }): number {
  if (waypoints.length < 2) return 0
  let nearestIdx = 0
  let minDist = Infinity
  for (let i = 0; i < waypoints.length; i++) {
    const dLat = waypoints[i].lat - position.lat
    const dLng = waypoints[i].lng - position.lng
    const dist = dLat * dLat + dLng * dLng
    if (dist < minDist) { minDist = dist; nearestIdx = i }
  }
  const fromIdx = Math.min(nearestIdx, waypoints.length - 2)
  const from = waypoints[fromIdx]
  const to = waypoints[fromIdx + 1]
  return Math.atan2(to.lng - from.lng, to.lat - from.lat)
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
