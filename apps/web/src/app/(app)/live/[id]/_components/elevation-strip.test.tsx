import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ElevationStrip } from './elevation-strip'
import type { MapWaypoint, MapSegmentData } from '@ridenrest/shared'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ReferenceLine: ({ x, stroke }: { x: number; stroke: string }) => (
    <div data-testid={`ref-line-${x}`} data-stroke={stroke} />
  ),
}))

function makeWaypoint(distKm: number, ele: number | null): MapWaypoint {
  return { lat: 0, lng: 0, distKm, ele }
}

const validWaypoints: MapWaypoint[] = [
  makeWaypoint(0, 100),
  makeWaypoint(10, 200),
  makeWaypoint(20, 150),
]

const emptySegments: MapSegmentData[] = []

afterEach(() => cleanup())

describe('ElevationStrip', () => {
  it('renders without crash with valid data', () => {
    render(
      <ElevationStrip
        waypoints={validWaypoints}
        segments={emptySegments}
        currentDistKm={5}
        targetDistKm={15}
      />,
    )
    expect(screen.getByTestId('elevation-strip')).toBeInTheDocument()
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('renders fallback when no elevation data', () => {
    const nullWaypoints = [makeWaypoint(0, null), makeWaypoint(1, null)]
    render(
      <ElevationStrip
        waypoints={nullWaypoints}
        segments={emptySegments}
        currentDistKm={null}
        targetDistKm={null}
      />,
    )
    expect(screen.getByTestId('elevation-strip')).toBeInTheDocument()
    expect(screen.getByText('Élévation non disponible')).toBeInTheDocument()
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument()
  })

  it('renders current GPS position ReferenceLine when currentDistKm is set', () => {
    render(
      <ElevationStrip
        waypoints={validWaypoints}
        segments={emptySegments}
        currentDistKm={5}
        targetDistKm={null}
      />,
    )
    expect(screen.getByTestId('ref-line-5')).toBeInTheDocument()
  })

  it('renders target ReferenceLine when targetDistKm is set', () => {
    render(
      <ElevationStrip
        waypoints={validWaypoints}
        segments={emptySegments}
        currentDistKm={null}
        targetDistKm={15}
      />,
    )
    expect(screen.getByTestId('ref-line-15')).toBeInTheDocument()
  })

  it('does not render position lines when both are null', () => {
    render(
      <ElevationStrip
        waypoints={validWaypoints}
        segments={emptySegments}
        currentDistKm={null}
        targetDistKm={null}
      />,
    )
    expect(screen.queryByTestId(/^ref-line-/)).not.toBeInTheDocument()
  })
})
