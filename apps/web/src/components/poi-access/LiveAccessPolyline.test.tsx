import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({
  useAccess: vi.fn(),
  accessProps: undefined as undefined | { map: unknown; geometry: unknown; fitOnShow?: boolean },
}))

vi.mock('./useAccess', () => ({ useAccess: h.useAccess }))
vi.mock('./AccessMapLayer', () => ({
  AccessMapLayer: (props: { map: unknown; geometry: unknown; fitOnShow?: boolean }) => {
    h.accessProps = props
    return null
  },
}))

import { LiveAccessPolyline } from './LiveAccessPolyline'

const GEOM = { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] }
const fakeMap = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  h.accessProps = undefined
})
afterEach(cleanup)

describe('LiveAccessPolyline', () => {
  it('queries access with the POI id + nearest-trace origin and passes the geometry (fitOnShow=false)', () => {
    h.useAccess.mockReturnValue({ data: { status: 'ok', geometry: GEOM } })

    render(<LiveAccessPolyline map={fakeMap} poiId="poi-1" isAccommodation />)

    expect(h.useAccess).toHaveBeenCalledWith('poi-1', { type: 'nearest-trace' })
    expect(h.accessProps?.geometry).toBe(GEOM)
    expect(h.accessProps?.fitOnShow).toBe(false)
  })

  it('disables the query (empty poiId) and renders no geometry for a non-accommodation POI', () => {
    h.useAccess.mockReturnValue({ data: undefined })

    render(<LiveAccessPolyline map={fakeMap} poiId="poi-1" isAccommodation={false} />)

    expect(h.useAccess).toHaveBeenCalledWith('', { type: 'nearest-trace' })
    expect(h.accessProps?.geometry).toBeNull()
  })

  it('passes null geometry on a fallback status (no polyline)', () => {
    h.useAccess.mockReturnValue({ data: { status: 'fallback', fallbackDistanceM: 500 } })

    render(<LiveAccessPolyline map={fakeMap} poiId="poi-1" isAccommodation />)

    expect(h.accessProps?.geometry).toBeNull()
  })
})
