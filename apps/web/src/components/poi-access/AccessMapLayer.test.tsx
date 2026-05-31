import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type maplibregl from 'maplibre-gl'
import type { AccessVariant } from '@ridenrest/shared'
import { AccessMapLayer } from './AccessMapLayer'

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
  setFilter: ReturnType<typeof vi.fn>
  fitBounds: ReturnType<typeof vi.fn>
  getCanvas: ReturnType<typeof vi.fn>
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
    setFilter: vi.fn(),
    fitBounds: vi.fn(),
    getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
    on: vi.fn(),
    off: vi.fn(),
    _source: null,
    _layerIds: layerIds,
  }
  return map
}

function variant(coords: number[][], overrides?: Partial<AccessVariant>): AccessVariant {
  return {
    entryPoint: [coords[0][0], coords[0][1]],
    distanceM: 1000,
    elevationGainM: 10,
    elevationLossM: 5,
    etaS: 600, usesMainRoad: false, mainRoadDistanceM: 0,
    geometry: { type: 'LineString', coordinates: coords },
    ...overrides,
  }
}

const V0 = variant([[2.35, 48.85], [2.36, 48.86], [2.37, 48.87]])
const V1 = variant([[2.40, 48.90], [2.41, 48.91]], { distanceM: 2000 })
const VARIANTS = [V0, V1]
const OTHER_VARIANTS = [variant([[2.50, 48.95], [2.51, 48.96]])]

const m = (map: MockMap) => map as unknown as maplibregl.Map

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AccessMapLayer (multi-variant)', () => {
  it('does nothing when map is null', () => {
    const { container } = render(<AccessMapLayer map={null} variants={VARIANTS} selectedIndex={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('mount with variants → addSource + 2 addLayer (ghost below, selected above)', () => {
    const map = createMockMap()
    render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)

    expect(map.addSource).toHaveBeenCalledWith(
      'poi-access-source',
      expect.objectContaining({
        type: 'geojson',
        data: expect.objectContaining({ type: 'FeatureCollection' }),
      }),
    )
    const ids = map.addLayer.mock.calls.map((c) => (c[0] as { id: string }).id)
    expect(ids).toEqual(['poi-access-ghost', 'poi-access-line'])
    // The selected layer is amber.
    const selected = map.addLayer.mock.calls.find((c) => (c[0] as { id: string }).id === 'poi-access-line')![0]
    expect(selected).toMatchObject({ paint: { 'line-color': '#f59e0b' } })
  })

  it('builds one feature per variant, tagged with idx', () => {
    const map = createMockMap()
    render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)

    const data = map.addSource.mock.calls[0][1].data as GeoJSON.FeatureCollection
    expect(data.features).toHaveLength(2)
    expect(data.features.map((f) => f.properties?.idx)).toEqual([0, 1])
  })

  it('inserts both layers below the first POI pins layer (Discovery #5)', () => {
    const map = createMockMap({ existingLayers: ['trace-line', 'pois-accommodations-points'] })
    render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)

    expect(map.addLayer.mock.calls[0][1]).toBe('pois-accommodations-points')
    expect(map.addLayer.mock.calls[1][1]).toBe('pois-accommodations-points')
  })

  it('fits bounds over ALL variants once on first display (AC#6)', () => {
    const map = createMockMap()
    render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)

    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    const [bounds, opts] = map.fitBounds.mock.calls[0]
    // bbox spans V0 + V1
    expect(bounds).toEqual([2.35, 48.85, 2.41, 48.91])
    expect(opts).toMatchObject({ padding: 40, duration: 500 })
  })

  it('changing only selectedIndex → updates filters, no new layers, no re-zoom', () => {
    const map = createMockMap()
    const { rerender } = render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)
    expect(map.addLayer).toHaveBeenCalledTimes(2)

    rerender(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={1} />)

    expect(map.addLayer).toHaveBeenCalledTimes(2) // no accumulation
    expect(map.setFilter).toHaveBeenCalledWith('poi-access-line', ['==', ['get', 'idx'], 1])
    expect(map.setFilter).toHaveBeenCalledWith('poi-access-ghost', ['!=', ['get', 'idx'], 1])
    expect(map._source?.setData).toHaveBeenCalled()
    expect(map.fitBounds).toHaveBeenCalledTimes(1) // same variants ref → no re-zoom
  })

  it('switching variant set → setData + re-zoom', () => {
    const map = createMockMap()
    const { rerender } = render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)
    rerender(<AccessMapLayer map={m(map)} variants={OTHER_VARIANTS} selectedIndex={0} />)

    expect(map.addLayer).toHaveBeenCalledTimes(2) // still 2, reused via setData
    expect(map._source?.setData).toHaveBeenCalled()
    expect(map.fitBounds).toHaveBeenCalledTimes(2)
  })

  it('clicking a ghost variant → onSelect with the feature idx', () => {
    const map = createMockMap()
    const onSelect = vi.fn()
    render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} onSelect={onSelect} />)

    const clickReg = map.on.mock.calls.find((c) => c[0] === 'click' && c[1] === 'poi-access-ghost')
    expect(clickReg).toBeDefined()
    const handler = clickReg![2] as (e: unknown) => void
    handler({ features: [{ properties: { idx: 1 } }] })

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('variants → null removes both layers and source (AC#5)', () => {
    const map = createMockMap()
    const { rerender } = render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)
    rerender(<AccessMapLayer map={m(map)} variants={null} selectedIndex={0} />)

    expect(map.removeLayer).toHaveBeenCalledWith('poi-access-line')
    expect(map.removeLayer).toHaveBeenCalledWith('poi-access-ghost')
    expect(map.removeSource).toHaveBeenCalledWith('poi-access-source')
  })

  it('empty variants is idempotent — no throw, nothing removed when absent', () => {
    const map = createMockMap()
    expect(() => render(<AccessMapLayer map={m(map)} variants={[]} selectedIndex={0} />)).not.toThrow()
    expect(map.removeLayer).not.toHaveBeenCalled()
  })

  it('unmount → full cleanup of layers and source', () => {
    const map = createMockMap()
    const { unmount } = render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)
    unmount()

    expect(map.removeLayer).toHaveBeenCalledWith('poi-access-line')
    expect(map.removeLayer).toHaveBeenCalledWith('poi-access-ghost')
    expect(map.removeSource).toHaveBeenCalledWith('poi-access-source')
  })

  it('unmount after map.remove() (style destroyed) → no throw', () => {
    const map = createMockMap()
    const { unmount } = render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)

    const destroyed = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'getLayer')")
    }
    map.getLayer.mockImplementation(destroyed)
    map.getSource.mockImplementation(destroyed)

    expect(() => unmount()).not.toThrow()
  })

  it('supports MultiLineString variants — bbox spans all sub-lines', () => {
    const map = createMockMap()
    const ml: AccessVariant = {
      entryPoint: [2.35, 48.85],
      distanceM: 1000,
      elevationGainM: 10,
      elevationLossM: 5,
      etaS: 600, usesMainRoad: false, mainRoadDistanceM: 0,
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [[2.35, 48.85], [2.36, 48.86]],
          [[2.38, 48.88], [2.39, 48.89]],
        ],
      },
    }
    render(<AccessMapLayer map={m(map)} variants={[ml]} selectedIndex={0} />)

    const [bounds] = map.fitBounds.mock.calls[0]
    expect(bounds).toEqual([2.35, 48.85, 2.39, 48.89])
  })

  it('defers layer creation until styledata when style not yet loaded', () => {
    const map = createMockMap({ styleLoaded: false })
    render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)

    expect(map.addSource).not.toHaveBeenCalled()
    const onStyleData = map.on.mock.calls.find((c) => c[0] === 'styledata')![1] as () => void
    onStyleData()
    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(2)
  })

  it('re-adds the layers after a style reload', () => {
    const map = createMockMap({ styleLoaded: true })
    render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} />)
    expect(map.addLayer).toHaveBeenCalledTimes(2)

    map._source = null
    map._layerIds.clear()
    const onStyleData = map.on.mock.calls.find((c) => c[0] === 'styledata')![1] as () => void
    onStyleData()

    expect(map.addSource).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledTimes(4)
  })

  it('does NOT fit bounds when fitOnShow=false (Live mode)', () => {
    const map = createMockMap()
    render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} fitOnShow={false} />)

    expect(map.addLayer).toHaveBeenCalledTimes(2)
    expect(map.fitBounds).not.toHaveBeenCalled()
  })

  it('deregisters click + styledata listeners on cleanup', () => {
    const map = createMockMap()
    const { unmount } = render(<AccessMapLayer map={m(map)} variants={VARIANTS} selectedIndex={0} onSelect={vi.fn()} />)
    unmount()

    const offEvents = map.off.mock.calls.map((c) => c[0])
    expect(offEvents).toContain('styledata')
    expect(offEvents).toContain('click')
  })
})
