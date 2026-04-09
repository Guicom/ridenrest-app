import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ElevationProfile } from './elevation-profile'
import type { MapWaypoint, MapSegmentData } from '@ridenrest/shared'

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children, onMouseLeave }: {
    children: React.ReactNode
    onMouseLeave?: () => void
  }) => (
    <div
      data-testid="area-chart"
      onMouseLeave={() => onMouseLeave?.()}
    >
      {children}
    </div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  // Tooltip passes props through to content — simulate active tooltip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Tooltip: ({ content }: { content?: React.ReactElement<any> }) => {
    if (!content) return null
    return React.cloneElement(content, {
      active: true,
      payload: [{ payload: { distKm: 42, ele: 500, cumulativeDPlus: 100, cumulativeDMinus: 30, slope: 5.2 } }],
    })
  },
  ReferenceLine: ({ x, stroke, label }: { x: number; stroke?: string; label?: { value?: string; position?: string } }) => (
    <div data-testid={`ref-line-${x}`} data-stroke={stroke} data-position={label?.position}>{label?.value}</div>
  ),
  ReferenceArea: ({ x1, x2, fill, fillOpacity }: { x1: number; x2: number; fill: string; fillOpacity: number }) => (
    <div data-testid="reference-area" data-x1={x1} data-x2={x2} data-fill={fill} data-fill-opacity={fillOpacity} />
  ),
}))

function makeWaypoint(distKm: number, ele: number | null): MapWaypoint {
  return { lat: 0, lng: 0, distKm, ele }
}

function makeSegment(id: string, name: string, cumulativeStartKm: number, distanceKm: number): MapSegmentData {
  return {
    id,
    name,
    orderIndex: 0,
    cumulativeStartKm,
    distanceKm,
    parseStatus: 'done',
    waypoints: null,
    boundingBox: null,
  }
}

afterEach(() => cleanup())

describe('ElevationProfile', () => {
  const validWaypoints: MapWaypoint[] = [
    makeWaypoint(0, 100),
    makeWaypoint(10, 200),
    makeWaypoint(20, 150),
  ]

  it('renders chart when valid elevation data present', () => {
    render(<ElevationProfile waypoints={validWaypoints} segments={[]} />)
    expect(screen.getByTestId('elevation-profile')).toBeInTheDocument()
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    expect(screen.queryByText(/non disponibles/)).not.toBeInTheDocument()
  })

  it('renders fallback when no elevation data', () => {
    const nullWaypoints = [makeWaypoint(0, null), makeWaypoint(1, null)]
    render(<ElevationProfile waypoints={nullWaypoints} segments={[]} />)
    expect(screen.getByTestId('elevation-profile')).toBeInTheDocument()
    expect(screen.getByText("Données d'élévation non disponibles")).toBeInTheDocument()
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument()
  })

  it('renders segment boundaries as ReferenceLine with label', () => {
    const segments: MapSegmentData[] = [
      makeSegment('s1', 'Etape 1', 0, 50),
      makeSegment('s2', 'Etape 2', 50, 50),
    ]
    const waypoints = [makeWaypoint(0, 100), makeWaypoint(50, 200), makeWaypoint(100, 150)]
    render(<ElevationProfile waypoints={waypoints} segments={segments} />)
    expect(screen.getByTestId('ref-line-50')).toBeInTheDocument()
    expect(screen.getByText('Etape 2')).toBeInTheDocument()
  })

  it('calls onHoverKm(null) on mouse leave', () => {
    const onHoverKm = vi.fn()
    render(<ElevationProfile waypoints={validWaypoints} segments={[]} onHoverKm={onHoverKm} />)
    const chart = screen.getByTestId('area-chart')
    fireEvent.mouseLeave(chart)
    expect(onHoverKm).toHaveBeenCalledWith(null)
  })

  it('calls onHoverKm with distKm when tooltip is active', async () => {
    const onHoverKm = vi.fn()
    render(<ElevationProfile waypoints={validWaypoints} segments={[]} onHoverKm={onHoverKm} />)
    // Tooltip mock always renders as active — ElevationTooltip calls onHoverKm(42) via useEffect
    await waitFor(() => expect(onHoverKm).toHaveBeenCalledWith(42))
  })

  it('renders stage ReferenceLine with stage color when stagesVisible=true', () => {
    const stages = [
      { id: 'st1', adventureId: 'adv-1', name: 'Étape 1', color: '#f97316', orderIndex: 0, startKm: 0, endKm: 10, distanceKm: 10, elevationGainM: null, elevationLossM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '' },
    ]
    render(<ElevationProfile waypoints={validWaypoints} segments={[]} stages={stages} stagesVisible={true} />)
    const stageLine = screen.getByTestId('ref-line-10')
    expect(stageLine).toBeInTheDocument()
    expect(stageLine.getAttribute('data-stroke')).toBe('#f97316')
    expect(screen.getByText('Étape 1')).toBeInTheDocument()
  })

  it('does not render stage ReferenceLine when stagesVisible=false', () => {
    const stages = [
      { id: 'st1', adventureId: 'adv-1', name: 'Étape 1', color: '#f97316', orderIndex: 0, startKm: 0, endKm: 10, distanceKm: 10, elevationGainM: null, elevationLossM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '' },
    ]
    render(<ElevationProfile waypoints={validWaypoints} segments={[]} stages={stages} stagesVisible={false} />)
    expect(screen.queryByTestId('ref-line-10')).not.toBeInTheDocument()
  })

  it('stage label uses insideTopLeft position — distinct from segment boundary insideTopRight', () => {
    const stages = [
      { id: 'st1', adventureId: 'adv-1', name: 'Étape 1', color: '#f97316', orderIndex: 0, startKm: 0, endKm: 7, distanceKm: 7, elevationGainM: null, elevationLossM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '' },
    ]
    const segments: MapSegmentData[] = [
      makeSegment('s1', 'Seg 1', 0, 10),
      makeSegment('s2', 'Seg 2', 10, 10),  // boundary at km 10
    ]
    const waypoints = [makeWaypoint(0, 100), makeWaypoint(10, 200), makeWaypoint(20, 150)]
    render(<ElevationProfile waypoints={waypoints} segments={segments} stages={stages} stagesVisible={true} />)
    // Stage line at km 7 — position insideTopLeft
    const stageLine = screen.getByTestId('ref-line-7')
    expect(stageLine.getAttribute('data-position')).toBe('insideTopLeft')
    // Segment boundary at km 10 — position insideTopRight
    const segBoundary = screen.getByTestId('ref-line-10')
    expect(segBoundary.getAttribute('data-position')).toBe('insideTopRight')
  })
})

describe('ElevationProfile — click mode', () => {
  const validWaypoints: MapWaypoint[] = [
    { lat: 0, lng: 0, distKm: 0, ele: 100 },
    { lat: 0, lng: 0, distKm: 25, ele: 200 },
  ]

  it('calls onClickKm with last hovered km when isClickModeActive=true and profile is clicked', async () => {
    // The Tooltip mock always renders active with distKm=42 → wrappedOnHoverKm(42) fires via
    // ElevationTooltip useEffect → lastKmRef is set → container click uses that value.
    const onClickKm = vi.fn()
    render(
      <ElevationProfile
        waypoints={validWaypoints}
        segments={[]}
        isClickModeActive={true}
        onClickKm={onClickKm}
      />,
    )
    // Wait for ElevationTooltip useEffect to fire onHoverKm(42) → updates lastKmRef
    await waitFor(() => {})
    fireEvent.click(screen.getByTestId('elevation-profile'))
    expect(onClickKm).toHaveBeenCalledWith(42)
  })

  it('does NOT call onClickKm when isClickModeActive=false', () => {
    const onClickKm = vi.fn()
    render(
      <ElevationProfile
        waypoints={validWaypoints}
        segments={[]}
        isClickModeActive={false}
        onClickKm={onClickKm}
      />,
    )
    fireEvent.click(screen.getByTestId('elevation-profile'))
    expect(onClickKm).not.toHaveBeenCalled()
  })

  it('applies cursor:crosshair style when isClickModeActive=true', () => {
    render(
      <ElevationProfile
        waypoints={validWaypoints}
        segments={[]}
        isClickModeActive={true}
      />,
    )
    expect(screen.getByTestId('elevation-profile')).toHaveStyle({ cursor: 'crosshair' })
  })

  it('does NOT apply cursor:crosshair when isClickModeActive=false', () => {
    render(
      <ElevationProfile
        waypoints={validWaypoints}
        segments={[]}
        isClickModeActive={false}
      />,
    )
    expect(screen.getByTestId('elevation-profile')).not.toHaveStyle({ cursor: 'crosshair' })
  })
})

describe('ElevationProfile — search range overlay', () => {
  const validWaypoints: MapWaypoint[] = [
    { lat: 0, lng: 0, distKm: 0, ele: 100 },
    { lat: 0, lng: 0, distKm: 25, ele: 200 },
  ]

  it('does NOT render ReferenceArea when searchRangeActive is false', () => {
    render(
      <ElevationProfile
        waypoints={validWaypoints}
        segments={[]}
        searchRangeActive={false}
        searchFromKm={5}
        searchToKm={15}
      />,
    )
    expect(screen.queryByTestId('reference-area')).not.toBeInTheDocument()
  })

  it('does NOT render ReferenceArea when searchRangeActive is not provided', () => {
    render(
      <ElevationProfile
        waypoints={validWaypoints}
        segments={[]}
      />,
    )
    expect(screen.queryByTestId('reference-area')).not.toBeInTheDocument()
  })

  it('renders ReferenceArea with correct props when searchRangeActive is true', () => {
    render(
      <ElevationProfile
        waypoints={validWaypoints}
        segments={[]}
        searchRangeActive={true}
        searchFromKm={5}
        searchToKm={15}
      />,
    )
    const area = screen.getByTestId('reference-area')
    expect(area).toBeInTheDocument()
    expect(area.getAttribute('data-x1')).toBe('5')
    expect(area.getAttribute('data-x2')).toBe('15')
    expect(area.getAttribute('data-fill')).toBe('#3498db')
    expect(area.getAttribute('data-fill-opacity')).toBe('0.2')
  })

  it('renders stage ReferenceLines alongside search range ReferenceArea', () => {
    const stages = [
      { id: 'st1', adventureId: 'adv-1', name: 'Étape 1', color: '#f97316', orderIndex: 0, startKm: 0, endKm: 10, distanceKm: 10, elevationGainM: null, elevationLossM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '' },
    ]
    render(
      <ElevationProfile
        waypoints={validWaypoints}
        segments={[]}
        stages={stages}
        stagesVisible={true}
        searchRangeActive={true}
        searchFromKm={5}
        searchToKm={20}
      />,
    )
    expect(screen.getByTestId('reference-area')).toBeInTheDocument()
    expect(screen.getByTestId('ref-line-10')).toBeInTheDocument()
    expect(screen.getByText('Étape 1')).toBeInTheDocument()
  })
})
