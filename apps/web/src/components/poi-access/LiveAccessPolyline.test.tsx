import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({
  useAccess: vi.fn(),
  accessProps: undefined as
    | undefined
    | { map: unknown; variants: unknown; selectedIndex?: number; onSelect?: unknown; fitOnShow?: boolean },
}))

vi.mock('./useAccess', () => ({ useAccess: h.useAccess }))
vi.mock('./AccessMapLayer', () => ({
  AccessMapLayer: (props: {
    map: unknown
    variants: unknown
    selectedIndex?: number
    onSelect?: unknown
    fitOnShow?: boolean
  }) => {
    h.accessProps = props
    return null
  },
}))

import { LiveAccessPolyline } from './LiveAccessPolyline'

const VARIANTS = [
  {
    entryPoint: [2.35, 48.85],
    distanceM: 1000,
    elevationGainM: 10,
    elevationLossM: 5,
    etaS: 600,
    geometry: { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] },
  },
]
const fakeMap = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  h.accessProps = undefined
})
afterEach(cleanup)

describe('LiveAccessPolyline', () => {
  it('queries access with the POI id + nearest-trace origin and passes the variants (fitOnShow=false)', () => {
    h.useAccess.mockReturnValue({ data: { status: 'ok', variants: VARIANTS } })

    render(
      <LiveAccessPolyline map={fakeMap} poiId="poi-1" isAccommodation selectedVariantIndex={0} onSelectVariant={vi.fn()} />,
    )

    expect(h.useAccess).toHaveBeenCalledWith('poi-1', { type: 'nearest-trace' })
    expect(h.accessProps?.variants).toBe(VARIANTS)
    expect(h.accessProps?.selectedIndex).toBe(0)
    expect(h.accessProps?.fitOnShow).toBe(false)
  })

  it('forwards the selected index and onSelect callback for ghost-click selection', () => {
    h.useAccess.mockReturnValue({ data: { status: 'ok', variants: VARIANTS } })
    const onSelect = vi.fn()

    render(
      <LiveAccessPolyline map={fakeMap} poiId="poi-1" isAccommodation selectedVariantIndex={2} onSelectVariant={onSelect} />,
    )

    expect(h.accessProps?.selectedIndex).toBe(2)
    expect(h.accessProps?.onSelect).toBe(onSelect)
  })

  it('disables the query (empty poiId) and renders no variants for a non-accommodation POI', () => {
    h.useAccess.mockReturnValue({ data: undefined })

    render(<LiveAccessPolyline map={fakeMap} poiId="poi-1" isAccommodation={false} selectedVariantIndex={0} />)

    expect(h.useAccess).toHaveBeenCalledWith('', { type: 'nearest-trace' })
    expect(h.accessProps?.variants).toBeNull()
  })

  it('passes null variants on a fallback status (no polyline)', () => {
    h.useAccess.mockReturnValue({ data: { status: 'fallback', fallbackDistanceM: 500 } })

    render(<LiveAccessPolyline map={fakeMap} poiId="poi-1" isAccommodation selectedVariantIndex={0} />)

    expect(h.accessProps?.variants).toBeNull()
  })
})
