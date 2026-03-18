import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { WeatherLayer } from './weather-layer'
import type { WeatherPoint } from '@ridenrest/shared'
import type { MapWaypoint } from '@ridenrest/shared'

// Mock the GeoJSON helpers to focus on lifecycle testing
vi.mock('@/lib/weather-geojson', () => ({
  buildWeatherLineSegments: vi.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
  buildWindArrowPoints: vi.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
}))

const mockPopupInstance = {
  setLngLat: vi.fn().mockReturnThis(),
  setHTML: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
}
const MockPopup = vi.fn(() => mockPopupInstance)
vi.mock('maplibre-gl', () => ({ Popup: MockPopup }))

function createMockMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Map<string, object>()
  const eventHandlers = new Map<string, ReturnType<typeof vi.fn>>()
  const canvas = { style: { cursor: '' } }

  return {
    isStyleLoaded: vi.fn().mockReturnValue(true),
    getSource: vi.fn((id: string) => sources.get(id) ?? undefined),
    addSource: vi.fn((id: string) => { sources.set(id, { setData: vi.fn() }) }),
    getLayer: vi.fn((id: string) => layers.has(id) ? {} : undefined),
    addLayer: vi.fn((layer: { id: string }) => { layers.set(layer.id, layer) }),
    removeLayer: vi.fn((id: string) => { layers.delete(id) }),
    removeSource: vi.fn((id: string) => { sources.delete(id) }),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    on: vi.fn((event: string, layerId: string, handler: ReturnType<typeof vi.fn>) => {
      eventHandlers.set(`${event}:${layerId}`, handler)
    }),
    off: vi.fn(),
    getCanvas: vi.fn().mockReturnValue(canvas),
    _sources: sources,
    _layers: layers,
  }
}

const sampleWeatherPoints: WeatherPoint[] = [
  { km: 0, forecastAt: '2026-03-22T08:00:00Z', temperatureC: 15, precipitationProbability: 10, windSpeedKmh: 20, windDirection: 180, weatherCode: 1, iconEmoji: '🌤' },
  { km: 5, forecastAt: '2026-03-22T08:15:00Z', temperatureC: 18, precipitationProbability: 5, windSpeedKmh: 15, windDirection: 90, weatherCode: 0, iconEmoji: '☀️' },
]

const sampleWaypoints: MapWaypoint[] = [
  { distKm: 0, lat: 48.0, lng: 2.0 },
  { distKm: 5, lat: 48.1, lng: 2.1 },
]

describe('WeatherLayer', () => {
  let mockMap: ReturnType<typeof createMockMap>

  beforeEach(() => {
    mockMap = createMockMap()
  })

  it('renders nothing in the DOM', () => {
    const { container } = render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="temperature"
        id="test"
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('adds weather-lines source and layer on mount', () => {
    render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="temperature"
        id="test"
      />
    )

    expect(mockMap.addSource).toHaveBeenCalledWith('weather-lines-test', expect.any(Object))
    expect(mockMap.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'weather-lines-layer-test' }),
      undefined,
    )
  })

  it('adds weather-wind-arrows source and layer on mount', () => {
    render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="temperature"
        id="test"
      />
    )

    expect(mockMap.addSource).toHaveBeenCalledWith('weather-wind-arrows-test', expect.any(Object))
    expect(mockMap.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'weather-wind-arrows-layer-test' }),
      undefined,
    )
  })

  it('mounts wind arrows layer with visibility=visible when dimension=wind', () => {
    render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="wind"
        id="test"
      />
    )

    expect(mockMap.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'weather-wind-arrows-layer-test',
        layout: expect.objectContaining({ visibility: 'visible' }) as object,
      }),
      undefined,
    )
  })

  it('removes layers and sources on unmount', () => {
    const { unmount } = render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="temperature"
        id="test"
      />
    )

    act(() => { unmount() })

    expect(mockMap.removeLayer).toHaveBeenCalledWith('weather-lines-layer-test')
    expect(mockMap.removeSource).toHaveBeenCalledWith('weather-lines-test')
    expect(mockMap.removeLayer).toHaveBeenCalledWith('weather-wind-arrows-layer-test')
    expect(mockMap.removeSource).toHaveBeenCalledWith('weather-wind-arrows-test')
  })

  it('removes event listeners on unmount', () => {
    const { unmount } = render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="temperature"
        id="test"
      />
    )

    act(() => { unmount() })

    expect(mockMap.off).toHaveBeenCalledWith('click', 'weather-lines-layer-test', expect.any(Function))
    expect(mockMap.off).toHaveBeenCalledWith('mouseenter', 'weather-lines-layer-test', expect.any(Function))
    expect(mockMap.off).toHaveBeenCalledWith('mouseleave', 'weather-lines-layer-test', expect.any(Function))
  })

  it('does nothing when weatherPoints is empty', () => {
    render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={[]}
        segmentWaypoints={sampleWaypoints}
        dimension="temperature"
        id="test"
      />
    )

    expect(mockMap.addSource).not.toHaveBeenCalled()
    expect(mockMap.addLayer).not.toHaveBeenCalled()
  })

  it('mounts lines layer with the initial dimension color expression', () => {
    render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="precipitation"
        id="test"
      />
    )

    expect(mockMap.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'weather-lines-layer-test',
        paint: expect.objectContaining({ 'line-color': expect.any(Array) }) as object,
      }),
      undefined,
    )
  })

  it('shows weather popup with data when clicking an available feature (AC #4)', async () => {
    MockPopup.mockClear()
    mockPopupInstance.setLngLat.mockClear()
    mockPopupInstance.setHTML.mockClear()

    render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="temperature"
        id="test"
      />
    )

    // Retrieve the registered click handler
    const clickCall = mockMap.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'click' && c[1] === 'weather-lines-layer-test',
    )
    expect(clickCall).toBeDefined()
    const clickHandler = clickCall![2] as (e: object) => void

    await act(async () => {
      clickHandler({
        lngLat: { lng: 2.0, lat: 48.0 },
        features: [{
          properties: {
            available: true,
            temperatureC: 15,
            windSpeedKmh: 20,
            windDirection: 180,
            precipitationProbability: 10,
            iconEmoji: '🌤',
            km: 0,
          },
        }],
      })
    })

    expect(MockPopup).toHaveBeenCalled()
    const htmlArg = mockPopupInstance.setHTML.mock.calls[0]?.[0] as string
    expect(htmlArg).toContain('15')  // temperature
    expect(htmlArg).toContain('20')  // wind speed
    expect(mockPopupInstance.addTo).toHaveBeenCalled()
  })

  it('shows "Prévisions non disponibles" popup when clicking an unavailable grey segment (AC #7)', async () => {
    MockPopup.mockClear()
    mockPopupInstance.setHTML.mockClear()

    render(
      <WeatherLayer
        map={mockMap as unknown as import('maplibre-gl').Map}
        weatherPoints={sampleWeatherPoints}
        segmentWaypoints={sampleWaypoints}
        dimension="temperature"
        id="test"
      />
    )

    const clickCall = mockMap.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'click' && c[1] === 'weather-lines-layer-test',
    )
    const clickHandler = clickCall![2] as (e: object) => void

    await act(async () => {
      clickHandler({
        lngLat: { lng: 2.0, lat: 48.0 },
        features: [{
          properties: {
            available: false,
            temperatureC: null,
            windSpeedKmh: null,
            windDirection: null,
            precipitationProbability: null,
            iconEmoji: null,
            km: 10,
          },
        }],
      })
    })

    expect(MockPopup).toHaveBeenCalled()
    const htmlArg = mockPopupInstance.setHTML.mock.calls[0]?.[0] as string
    expect(htmlArg).toContain('Prévisions non disponibles')
    expect(mockPopupInstance.addTo).toHaveBeenCalled()
  })
})
