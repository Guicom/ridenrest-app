'use client'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useElevationProfile } from '@/hooks/use-elevation-profile'
import type { MapWaypoint, MapSegmentData } from '@ridenrest/shared'

interface ElevationStripProps {
  waypoints: MapWaypoint[]
  segments: MapSegmentData[]
  currentDistKm: number | null
  targetDistKm: number | null
}

export function ElevationStrip({ waypoints, segments, currentDistKm, targetDistKm }: ElevationStripProps) {
  const { points, hasElevationData } = useElevationProfile(waypoints, segments)

  if (!hasElevationData) {
    return (
      <div data-testid="elevation-strip" className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Élévation non disponible</p>
      </div>
    )
  }

  return (
    <div data-testid="elevation-strip" className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 2, right: 4, bottom: 2, left: 0 }}
        >
          <XAxis hide={true} dataKey="distKm" type="number" domain={['auto', 'auto']} />
          <YAxis hide={true} dataKey="ele" />
          <Area
            dataKey="ele"
            fill="var(--primary-light, hsl(var(--primary) / 0.2))"
            stroke="var(--primary)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {currentDistKm !== null && (
            <ReferenceLine
              x={currentDistKm}
              stroke="#16a34a"
              strokeWidth={2}
            />
          )}
          {targetDistKm !== null && (
            <ReferenceLine
              x={targetDistKm}
              stroke="white"
              strokeWidth={2}
              strokeDasharray="2 2"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
