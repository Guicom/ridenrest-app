import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type maplibregl from 'maplibre-gl'
import { AccessMapLayer, type AccessGeometry } from './AccessMapLayer'

// ── MapLibre mock ──────────────────────────────────────────────────────────────

interface MockSource {
  setData: ReturnType<typeof vi.fn>
}

interface MockMap {
  isStyleLoaded: ReturnType<typeof vi.fn>
  getSource: ReturnType<typeof vi.fn>
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  removeLayer: ReturnType<typeof vi.fn>
  removeSource: ReturnType<typeof vi.fn>
  getLayer: ReturnType<typeof vi.fn>
  fitBounds: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  _source: MockSource | null
  _layerIds: Set<string>
}

function createMockMap(options?: { styleLoaded?: boolean; existingLayers?: string[] }): MockMap {
  const layerIds = new Set<string>(options?.existingLayers ?? [])
  const source: MockSource = { setData: vi.fn() }
  const map: MockMap = {
    isStyleLoaded: vi.fn().mockReturnValue(options?.styleLoaded ?? true),
    // Returns the source only once it has been "added" (tracked via _source)
    getSource: vi.fn(() => map._source),
    addSource: vi.fn(() => {
      map._source = source
      layerIds.add('poi-access-source')
    }),
    addLayer: vi.fn((layer: { id: string }) => {
      layerIds.add(layer.id)
    }),
    removeLayer: vi.fn((id: string) => {
      layerIds.delete(id)
    }),
    removeSource: vi.fn(() => {
      map._source = null
    }),
    getLayer: vi.fn((id: string) => (layerIds.has(id) ? { id } : undefined)),
    fitBounds: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    _source: null,
    _layerIds: layerIds,
  }
  return map
}

const LINESTRING: AccessGeometry = {
  type: 'LineString',
  coordinates: [
    [2.35, 48.85],
    [2.36, 48.86],
    [2.37, 48.87],
  ],
}

const OTHER_LINESTRING: AccessGeometry = {
  type: 'LineString',
  coordinates: [
    [2.40, 48.90],
    [2.41, 48.91],
  ],
}

const MULTILINESTRING: AccessGeometry = {
  type: 'MultiLineString',
  coordinates: [
    [
      [2.35, 48.85],
      [2.36, 48.86],
    ],
    [
      [2.38, 48.88],
      [2.39, 48.89],
    ],
  ],
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AccessMapLayer', () => {
  it('does nothing when map is null', () => {
    // No throw, renders nothing
    const { container } = render(<AccessMapLayer map={null} geometry={LINESTRING} />)
    expect(container.firstChild).toBeNull()
  })

  it('mount with valid geometry → addSource + addLayer called (AC#2, AC#7)', () => {
    const map = createMockMap()
    render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />)

    expect(map.addSource).toHaveBeenCalledWith('poi-access-source', expect.objectContaining({
      type: 'geojson',
      data: expect.objectContaining({ type: 'Feature', geometry: LINESTRING }),
    }))
    expect(map.addLayer).toHaveBeenCalledTimes(1)
    const [layerArg] = map.addLayer.mock.calls[0]
    expect(layerArg).toMatchObject({
      id: 'poi-access-line',
      source: 'poi-access-source',
      type: 'line',
      paint: {
        'line-color': '#f59e0b',
        'line-width': 4,
        'line-dasharray': [2, 2],
        'line-opacity': 0.9,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
  })

  it('inserts the line below the first POI pins layer via beforeId (AC#2, Discovery #5)', () => {
    const map = createMockMap({ existingLayers: ['trace-line', 'pois-accommodations-points'] })
    render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />)

    const beforeId = map.addLayer.mock.calls[0][1]
    expect(beforeId).toBe('pois-accommodations-points')
  })

  it('inserts at the top (beforeId undefined) when no POI pins layer exists', () => {
    const map = createMockMap({ existingLayers: ['trace-line'] })
    render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />)

    const beforeId = map.addLayer.mock.calls[0][1]
    expect(beforeId).toBeUndefined()
  })

  it('zooms to fit the geometry once on first display (AC#6)', () => {
    const map = createMockMap()
    render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />)

    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    const [bounds, opts] = map.fitBounds.mock.calls[0]
    // bbox [minLng, minLat, maxLng, maxLat]
    expect(bounds).toEqual([2.35, 48.85, 2.37, 48.87])
    expect(opts).toMatchObject({ padding: 40, duration: 500 })
  })

  it('does not re-zoom when re-rendered with the same geometry reference (AC#6)', () => {
    const map = createMockMap()
    const { rerender } = render(
      <AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />,
    )
    rerender(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />)

    expect(map.fitBounds).toHaveBeenCalledTimes(1)
  })

  it('switching geometry → updates via setData (no second addLayer) and re-zooms (AC#3, AC#4)', () => {
    const map = createMockMap()
    const { rerender } = render(
      <AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />,
    )
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(1)

    rerender(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={OTHER_LINESTRING} />)

    // Source already present → setData, not a new layer (no accumulation, AC#4)
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(1)
    expect(map._source?.setData).toHaveBeenCalledWith(
      expect.objectContaining({ geometry: OTHER_LINESTRING }),
    )
    // Re-zoom on the new POI's route
    expect(map.fitBounds).toHaveBeenCalledTimes(2)
  })

  it('geometry → null removes the layer and source (AC#5)', () => {
    const map = createMockMap()
    const { rerender } = render(
      <AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />,
    )
    rerender(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={null} />)

    expect(map.removeLayer).toHaveBeenCalledWith('poi-access-line')
    expect(map.removeSource).toHaveBeenCalledWith('poi-access-source')
  })

  it('null geometry is idempotent — no throw when layer absent (AC#5)', () => {
    const map = createMockMap()
    expect(() =>
      render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={null} />),
    ).not.toThrow()
    expect(map.removeLayer).not.toHaveBeenCalled()
    expect(map.removeSource).not.toHaveBeenCalled()
  })

  it('unmount → full cleanup of layer and source (AC#5, AC#7)', () => {
    const map = createMockMap()
    const { unmount } = render(
      <AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />,
    )
    unmount()

    expect(map.removeLayer).toHaveBeenCalledWith('poi-access-line')
    expect(map.removeSource).toHaveBeenCalledWith('poi-access-source')
  })

  it('unmount after the map was destroyed (map.remove()) → no throw', () => {
    // Reproduit la navigation hors carte : MapLibre appelle map.remove(), le style interne
    // disparaît, et getLayer/getSource throw « Cannot read properties of undefined ». Le
    // cleanup d'AccessMapLayer ne doit PAS propager cette erreur (régression 2026-05-30).
    const map = createMockMap()
    const { unmount } = render(
      <AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />,
    )

    // Simule map.remove() : tout accès au style throw désormais.
    const destroyed = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'getLayer')")
    }
    map.getLayer.mockImplementation(destroyed)
    map.getSource.mockImplementation(destroyed)

    expect(() => unmount()).not.toThrow()
  })

  it('supports MultiLineString geometry — bbox spans all sub-lines (AC#2)', () => {
    const map = createMockMap()
    render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={MULTILINESTRING} />)

    expect(map.addLayer).toHaveBeenCalledTimes(1)
    const [bounds] = map.fitBounds.mock.calls[0]
    expect(bounds).toEqual([2.35, 48.85, 2.39, 48.89])
  })

  it('defers layer creation until styledata when style not yet loaded (Discovery #1)', () => {
    const map = createMockMap({ styleLoaded: false })
    render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />)

    // Nothing added yet — waiting for styledata
    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.on).toHaveBeenCalledWith('styledata', expect.any(Function))

    // Fire the deferred styledata handler → layer is added
    const onStyleData = map.on.mock.calls.find((c) => c[0] === 'styledata')![1] as () => void
    onStyleData()
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(1)
  })

  it('re-adds the layer after a style reload (map.setStyle / theme switch)', () => {
    const map = createMockMap({ styleLoaded: true })
    render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />)

    // Initial display
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(1)

    // Simulate setStyle wiping all custom sources/layers.
    map._source = null
    map._layerIds.clear()

    // MapLibre emits 'styledata' once the new style is applied.
    const onStyleData = map.on.mock.calls.find((c) => c[0] === 'styledata')![1] as () => void
    onStyleData()

    // Polyline is re-inserted (source + layer added again), not left missing.
    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledTimes(2)
  })

  it('deregisters the styledata listener on cleanup', () => {
    const map = createMockMap()
    const { unmount } = render(
      <AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />,
    )
    const onStyleData = map.on.mock.calls.find((c) => c[0] === 'styledata')![1]
    unmount()
    expect(map.off).toHaveBeenCalledWith('styledata', onStyleData)
  })

  it('fits bounds on show by default (Planning, AC#6)', () => {
    const map = createMockMap()
    render(<AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} />)
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
  })

  it('does NOT fit bounds when fitOnShow=false (Live mode, Story 3.3)', () => {
    const map = createMockMap()
    render(
      <AccessMapLayer map={map as unknown as maplibregl.Map} geometry={LINESTRING} fitOnShow={false} />,
    )
    // Polyline still added, but no programmatic camera move (GPS follow owns the camera).
    expect(map.addLayer).toHaveBeenCalledTimes(1)
    expect(map.fitBounds).not.toHaveBeenCalled()
  })
})
