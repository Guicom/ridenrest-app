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
      payload: [{ payload: { distKm: 42, ele: 500, cumulativeDPlus: 100, slope: 5.2 } }],
    })
  },
  ReferenceLine: ({ x, label }: { x: number; label?: { value?: string } }) => (
    <div data-testid={`ref-line-${x}`}>{label?.value}</div>
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
})
