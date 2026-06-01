import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LiveElevationProfile } from './live-elevation-profile'
import type { MapWaypoint, MapSegmentData } from '@ridenrest/shared'

// Mock recharts — the wrapper renders the real ElevationProfile, so we inspect the
// X-axis domain, the position marker and the search-zone ReferenceArea it produces.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  XAxis: ({ domain, allowDataOverflow, height }: { domain?: Array<number | string>; allowDataOverflow?: boolean; height?: number }) => (
    <div
      data-testid="x-axis"
      data-domain={Array.isArray(domain) ? domain.join(',') : String(domain)}
      data-allow-overflow={String(!!allowDataOverflow)}
      data-height={String(height)}
    />
  ),
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: ({ x, stroke }: { x: number; stroke?: string }) => (
    <div data-testid={`ref-line-${x}`} data-stroke={stroke} />
  ),
  ReferenceArea: ({ x1, x2, fill, fillOpacity }: { x1: number; x2: number; fill: string; fillOpacity: number }) => (
    <div data-testid="reference-area" data-x1={x1} data-x2={x2} data-fill={fill} data-fill-opacity={fillOpacity} />
  ),
}))

function makeWaypoint(distKm: number, ele: number | null): MapWaypoint {
  return { lat: 0, lng: 0, distKm, ele }
}

// Trace of 300 km with elevation everywhere
const trace: MapWaypoint[] = [
  makeWaypoint(0, 100),
  makeWaypoint(50, 200),
  makeWaypoint(150, 150),
  makeWaypoint(300, 250),
]
const segments: MapSegmentData[] = []

afterEach(() => cleanup())

describe('LiveElevationProfile — window & markers', () => {
  it('windows X to [currentKm, currentKm + target + 100] when far from trace end', () => {
    // current=20, target=30 → right edge = 20+30+100 = 150 (< total 300)
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={20}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    const xAxis = screen.getByTestId('x-axis')
    expect(xAxis.getAttribute('data-domain')).toBe('20,150')
    expect(xAxis.getAttribute('data-allow-overflow')).toBe('true')
  })

  it('bounds the right edge at totalDistKm when target + 100 overflows the trace', () => {
    // current=250, target=30 → 250+30+100 = 380 → clamped to total 300
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={250}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    expect(screen.getByTestId('x-axis').getAttribute('data-domain')).toBe('250,300')
  })

  it('highlights the search zone as [target - r, target + r]', () => {
    // current=20, target=30 → centre = 50, r=5 → [45, 55]
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={20}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    const zone = screen.getByTestId('reference-area')
    expect(zone.getAttribute('data-x1')).toBe('45')
    expect(zone.getAttribute('data-x2')).toBe('55')
    expect(zone.getAttribute('data-fill')).toBe('#3498db')
    expect(zone.getAttribute('data-fill-opacity')).toBe('0.2')
  })

  it('clamps the search zone inside the visible window', () => {
    // current=250 (=domainFrom), target=10 → centre=260, r=20 → raw [240, 280]
    // clamped to [250, 280] (left edge can't go below domainFrom=250)
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={250}
        targetAheadKm={10}
        searchRadiusKm={20}
      />,
    )
    const zone = screen.getByTestId('reference-area')
    expect(zone.getAttribute('data-x1')).toBe('250')
    expect(zone.getAttribute('data-x2')).toBe('280')
  })

  it('renders a tightened (compact) X-axis band to remove the space below the distance axis', () => {
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={20}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    expect(screen.getByTestId('x-axis').getAttribute('data-height')).toBe('16')
  })

  it('renders the green position marker at currentKmOnRoute', () => {
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={20}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    const marker = screen.getByTestId('ref-line-20')
    expect(marker).toBeInTheDocument()
    expect(marker.getAttribute('data-stroke')).toBe('#16a34a')
  })

  it('re-frames the window when targetAheadKm changes (zoom effect)', () => {
    const { rerender } = render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={20}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    expect(screen.getByTestId('x-axis').getAttribute('data-domain')).toBe('20,150')
    // Slider moved to 10 → right edge = 20+10+100 = 130
    rerender(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={20}
        targetAheadKm={10}
        searchRadiusKm={5}
      />,
    )
    expect(screen.getByTestId('x-axis').getAttribute('data-domain')).toBe('20,130')
  })

  it('derives totalDistKm from the last waypoint when not provided', () => {
    // current=290, target=30 → 290+30+100=420 → clamp to last waypoint distKm=300
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={290}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    expect(screen.getByTestId('x-axis').getAttribute('data-domain')).toBe('290,300')
  })

  it('never inverts the X domain when the GPS position overshoots the trace end', () => {
    // current=305 > total 300 (float overshoot / stale snap). domainFrom would be 305 and
    // the raw right edge min(300, …) = 300 < 305 → inverted. The guard floors domainTo to
    // domainFrom, so the domain stays non-inverted ([305, 305]) instead of [305, 300].
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={305}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    const [from, to] = screen.getByTestId('x-axis').getAttribute('data-domain')!.split(',').map(Number)
    expect(to).toBeGreaterThanOrEqual(from)
    expect(screen.getByTestId('x-axis').getAttribute('data-domain')).toBe('305,305')
  })

  it('uses an explicit totalDistKm prop over the derived value', () => {
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={20}
        targetAheadKm={30}
        searchRadiusKm={5}
        totalDistKm={120}
      />,
    )
    // right edge = min(120, 20+30+100=150) = 120
    expect(screen.getByTestId('x-axis').getAttribute('data-domain')).toBe('20,120')
  })
})

describe('LiveElevationProfile — graceful degradation', () => {
  it('renders the full trace with no window/marker when currentKmOnRoute is null', () => {
    render(
      <LiveElevationProfile
        waypoints={trace}
        segments={segments}
        currentKmOnRoute={null}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    // Default full-trace domain, no clamp, no marker, no search zone
    expect(screen.getByTestId('x-axis').getAttribute('data-domain')).toBe('dataMin,dataMax')
    expect(screen.queryByTestId(/^ref-line-/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('reference-area')).not.toBeInTheDocument()
  })

  it('shows the "non disponibles" message when there is no elevation data', () => {
    const flat = [makeWaypoint(0, null), makeWaypoint(100, null)]
    render(
      <LiveElevationProfile
        waypoints={flat}
        segments={segments}
        currentKmOnRoute={20}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    )
    expect(screen.getByText("Données d'élévation non disponibles")).toBeInTheDocument()
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument()
  })
})
