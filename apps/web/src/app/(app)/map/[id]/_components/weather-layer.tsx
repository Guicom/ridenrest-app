'use client'
import { useEffect, useRef } from 'react'
import { buildWeatherLineSegments, buildWindArrowPoints } from '@/lib/weather-geojson'
import type { WeatherPoint } from '@ridenrest/shared'
import type { MapWaypoint } from '@ridenrest/shared'
import type maplibregl from 'maplibre-gl'

export type WeatherDimension = 'temperature' | 'precipitation' | 'wind'

interface WeatherLayerProps {
  map: maplibregl.Map | null
  weatherPoints: WeatherPoint[]
  segmentWaypoints: MapWaypoint[]
  dimension: WeatherDimension
  id: string
}

export const LINE_COLOR_EXPRESSIONS: Record<WeatherDimension, maplibregl.ExpressionSpecification> = {
  temperature: ['case', ['get', 'available'],
    ['interpolate', ['linear'], ['get', 'temperatureC'], 0, '#3b82f6', 15, '#fbbf24', 30, '#ef4444'],
    '#9ca3af',
  ],
  precipitation: ['case', ['get', 'available'],
    ['interpolate', ['linear'], ['get', 'precipitationProbability'], 0, '#86efac', 50, '#facc15', 100, '#1d4ed8'],
    '#9ca3af',
  ],
  wind: ['case', ['get', 'available'],
    ['interpolate', ['linear'], ['get', 'windSpeedKmh'], 0, '#d1fae5', 30, '#fb923c', 60, '#7c3aed'],
    '#9ca3af',
  ],
}

export function WeatherLayer({ map, weatherPoints, segmentWaypoints, dimension, id }: WeatherLayerProps) {
  const sourceLines = `weather-lines-${id}`
  const sourceArrows = `weather-wind-arrows-${id}`
  const layerLines = `weather-lines-layer-${id}`
  const layerArrows = `weather-wind-arrows-layer-${id}`

  // Stores event handler references for cleanup
  const handlersRef = useRef<{
    click: (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => void
    mouseenter: () => void
    mouseleave: () => void
  } | null>(null)

  // Handles data updates (new weather fetched or segmentWaypoints changed).
  // Dimension changes are handled by the parent map-canvas.tsx effect to update all segments atomically.
  useEffect(() => {
    if (!map || !map.isStyleLoaded() || weatherPoints.length === 0) return

    const linesGeoJson = buildWeatherLineSegments(segmentWaypoints, weatherPoints)
    const arrowsGeoJson = buildWindArrowPoints(weatherPoints, segmentWaypoints)

    const linesSource = map.getSource(sourceLines) as maplibregl.GeoJSONSource | undefined
    const arrowsSource = map.getSource(sourceArrows) as maplibregl.GeoJSONSource | undefined

    if (linesSource) {
      linesSource.setData(linesGeoJson)
      if (map.getLayer(layerLines)) {
        map.setPaintProperty(layerLines, 'line-color', LINE_COLOR_EXPRESSIONS[dimension])
      }
    } else {
      map.addSource(sourceLines, { type: 'geojson', data: linesGeoJson })

      // Insert before POI symbols to keep pins on top
      const beforeId = map.getLayer('poi-symbols') ? 'poi-symbols' : undefined

      map.addLayer(
        {
          id: layerLines,
          type: 'line',
          source: sourceLines,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': 5,
            'line-color': LINE_COLOR_EXPRESSIONS[dimension],
          },
        },
        beforeId,
      )

      // Click handler for popup
      const clickHandler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features?.length) return
        const props = e.features[0].properties as {
          temperatureC: number | null
          windSpeedKmh: number | null
          windDirection: number | null
          precipitationProbability: number | null
          iconEmoji: string | null
          km: number
          available: boolean
        }

        if (!props.available) {
          import('maplibre-gl').then(({ Popup }) => {
            new Popup({ closeButton: true, closeOnClick: true })
              .setLngLat(e.lngLat)
              .setHTML('<div class="text-sm text-muted-foreground font-medium">Prévisions non disponibles</div>')
              .addTo(map)
          })
          return
        }

        import('maplibre-gl').then(({ Popup }) => {
          const windDirStr = props.windDirection !== null ? ` ${props.windDirection}°` : ''
          new Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="text-sm space-y-1">
                <div class="font-medium">${props.iconEmoji ?? '🌡'} km ${props.km.toFixed(1)}</div>
                <div>🌡 ${props.temperatureC !== null ? `${props.temperatureC.toFixed(1)}°C` : 'N/A'}</div>
                <div>💨 ${props.windSpeedKmh !== null ? `${props.windSpeedKmh.toFixed(0)} km/h` : 'N/A'}${windDirStr}</div>
                <div>🌧 ${props.precipitationProbability !== null ? `${props.precipitationProbability}%` : 'N/A'}</div>
              </div>
            `)
            .addTo(map)
        })
      }
      const mouseenterHandler = () => { map.getCanvas().style.cursor = 'pointer' }
      const mouseleaveHandler = () => { map.getCanvas().style.cursor = '' }

      handlersRef.current = { click: clickHandler, mouseenter: mouseenterHandler, mouseleave: mouseleaveHandler }
      map.on('click', layerLines, clickHandler)
      map.on('mouseenter', layerLines, mouseenterHandler)
      map.on('mouseleave', layerLines, mouseleaveHandler)
    }

    if (arrowsSource) {
      arrowsSource.setData(arrowsGeoJson)
      if (map.getLayer(layerArrows)) {
        map.setLayoutProperty(layerArrows, 'visibility', dimension === 'wind' ? 'visible' : 'none')
      }
    } else {
      map.addSource(sourceArrows, { type: 'geojson', data: arrowsGeoJson })

      const beforeId = map.getLayer('poi-symbols') ? 'poi-symbols' : undefined
      map.addLayer(
        {
          id: layerArrows,
          type: 'symbol',
          source: sourceArrows,
          layout: {
            'text-field': '→',
            'text-size': 16,
            'text-rotate': ['coalesce', ['get', 'windDirectionMaplibre'], 0],
            'text-rotation-alignment': 'map',
            'text-allow-overlap': true,
            'visibility': dimension === 'wind' ? 'visible' : 'none',
          },
          paint: {
            'text-color': '#1e40af',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1,
          },
        },
        beforeId,
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, weatherPoints, segmentWaypoints, sourceLines, sourceArrows, layerLines, layerArrows])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map) return
      const handlers = handlersRef.current
      if (handlers) {
        map.off('click', layerLines, handlers.click)
        map.off('mouseenter', layerLines, handlers.mouseenter)
        map.off('mouseleave', layerLines, handlers.mouseleave)
        map.getCanvas().style.cursor = ''
      }
      if (map.getLayer(layerArrows)) map.removeLayer(layerArrows)
      if (map.getSource(sourceArrows)) map.removeSource(sourceArrows)
      if (map.getLayer(layerLines)) map.removeLayer(layerLines)
      if (map.getSource(sourceLines)) map.removeSource(sourceLines)
    }
  }, [map, sourceLines, sourceArrows, layerLines, layerArrows])

  return null  // Purely imperative — renders nothing in the DOM
}
