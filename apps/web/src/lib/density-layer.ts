import type maplibregl from 'maplibre-gl'
import type { MapSegmentData, CoverageGapSummary } from '@ridenrest/shared'

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

/**
 * Add density-colored trace line on the map.
 * @param onSegmentClick — optional click callback (planning mode sets search range, live mode can skip)
 * @param traceLayerId — the trace line layer to hide when density is shown (default: 'trace-line')
 */
export function addDensityLayer(
  map: maplibregl.Map,
  segments: MapSegmentData[],
  coverageGaps: CoverageGapSummary[],
  options?: {
    onSegmentClick?: (fromKm: number, toKm: number) => void
    traceLayerId?: string
    beforeLayerId?: string
  },
) {
  const features = buildDensityColoredFeatures(segments, coverageGaps)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const traceLayerId = options?.traceLayerId ?? 'trace-line'

  // Remove existing density layer+source if present
  removeDensityLayer(map, traceLayerId)

  map.addSource('trace-density', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  })

  const beforeId = options?.beforeLayerId ?? (map.getLayer('trace-joins-circle') ? 'trace-joins-circle' : undefined)
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
    requestAnimationFrame(() => {
      if (map.getLayer('trace-density-line')) {
        map.setPaintProperty('trace-density-line', 'line-opacity', 0.9)
      }
    })
  }

  // Hide original trace layer
  if (map.getLayer(traceLayerId)) {
    map.setLayoutProperty(traceLayerId, 'visibility', 'none')
  }

  // Event handlers
  const clickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
    const feature = e.features?.[0]
    if (!feature?.properties) return
    const { fromKmAbsolute, toKmAbsolute } = feature.properties as {
      fromKmAbsolute: number
      toKmAbsolute: number
    }
    options?.onSegmentClick?.(fromKmAbsolute, toKmAbsolute)
  }
  const mouseenterHandler = () => { map.getCanvas().style.cursor = 'pointer' }
  const mouseleaveHandler = () => { map.getCanvas().style.cursor = '' }

  densityEventHandlers.set(map, { click: clickHandler, mouseenter: mouseenterHandler, mouseleave: mouseleaveHandler })
  map.on('click', 'trace-density-line', clickHandler)
  map.on('mouseenter', 'trace-density-line', mouseenterHandler)
  map.on('mouseleave', 'trace-density-line', mouseleaveHandler)
}

export function removeDensityLayer(map: maplibregl.Map, traceLayerId = 'trace-line') {
  const handlers = densityEventHandlers.get(map)
  if (handlers) {
    map.off('click', 'trace-density-line', handlers.click)
    map.off('mouseenter', 'trace-density-line', handlers.mouseenter)
    map.off('mouseleave', 'trace-density-line', handlers.mouseleave)
    densityEventHandlers.delete(map)
    try { map.getCanvas().style.cursor = '' } catch { /* map may be disposed */ }
  }
  if (map.getLayer('trace-density-line')) {
    map.removeLayer('trace-density-line')
  }
  if (map.getSource('trace-density')) {
    map.removeSource('trace-density')
  }
  // Restore original trace layer
  if (map.getLayer(traceLayerId)) {
    map.setLayoutProperty(traceLayerId, 'visibility', 'visible')
  }
}
