'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceArea } from 'recharts'
import { useElevationProfile } from '@/hooks/use-elevation-profile'
import type { ElevationPoint } from '@/hooks/use-elevation-profile'
import type { MapWaypoint, MapSegmentData, AdventureStageResponse } from '@ridenrest/shared'

interface ElevationProfileProps {
  waypoints: MapWaypoint[]
  segments: MapSegmentData[]
  onHoverKm?: (distKm: number | null) => void
  className?: string
  stages?: AdventureStageResponse[]
  stagesVisible?: boolean
  isClickModeActive?: boolean
  onClickKm?: (km: number) => void
  searchFromKm?: number
  searchToKm?: number
  searchRangeActive?: boolean
}

interface TooltipEntry {
  active?: boolean
  payload?: Array<{ payload: ElevationPoint }>
  onHoverKm?: (distKm: number | null) => void
}

// In recharts v3 the Tooltip content is the only reliable way to get activePayload.
// useEffect ensures onHoverKm is called after commit, not during render (Concurrent Mode safe).
const ElevationTooltip = ({ active, payload, onHoverKm }: TooltipEntry) => {
  const data = active && payload?.length ? payload[0].payload : null
  const km = data?.distKm ?? null

  // onHoverKm is stable (useCallback([]) in parent) — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onHoverKm?.(km) }, [km])

  if (!data) return null
  const { distKm, ele, cumulativeDPlus, slope } = data
  const slopeColor = slope > 8 ? 'text-red-500' : slope > 4 ? 'text-orange-400' : slope < -4 ? 'text-blue-400' : undefined
  return (
    <div className="rounded border border-[--border] bg-background px-2 py-1 text-xs shadow-sm">
      <p><span className="text-muted-foreground">km </span><span className="font-mono font-medium">{distKm.toFixed(1)}</span></p>
      <p><span className="text-muted-foreground">alt </span><span className="font-mono font-medium">{ele.toFixed(0)} m</span></p>
      <p><span className="text-muted-foreground">pente </span><span className={`font-mono font-medium ${slopeColor ?? ''}`}>{slope > 0 ? '+' : ''}{slope.toFixed(1)} %</span></p>
      <p><span className="text-muted-foreground">D+ </span><span className="font-mono font-medium">{cumulativeDPlus.toFixed(0)} m</span></p>
    </div>
  )
}

export function ElevationProfile({ waypoints, segments, onHoverKm, className, stages, stagesVisible = false, isClickModeActive, onClickKm, searchFromKm, searchToKm, searchRangeActive }: ElevationProfileProps) {
  const { points, boundaries, hasElevationData } = useElevationProfile(waypoints, segments)

  // Measure container — bypasses ResponsiveContainer which creates a 0×0 wrapper
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Track last hovered km — recharts onClick is unreliable (activePayload can be null).
  // We update this ref via the wrapped onHoverKm which is called from ElevationTooltip
  // on every hover (this already drives the map crosshair, so it's definitely reliable).
  const lastKmRef = useRef<number | null>(null)

  // Wrap onHoverKm to capture last valid km before forwarding to parent
  const wrappedOnHoverKm = useCallback((km: number | null) => {
    if (km !== null) lastKmRef.current = km
    onHoverKm?.(km)
  }, [onHoverKm])

  // Native div click — more reliable than recharts onClick
  const handleContainerClick = () => {
    if (!isClickModeActive || !onClickKm || lastKmRef.current === null) return
    onClickKm(lastKmRef.current)
  }

  if (!hasElevationData) {
    return (
      <div data-testid="elevation-profile" className={`flex h-full items-center justify-center ${className ?? ''}`}>
        <p className="text-xs text-muted-foreground">Données d&apos;élévation non disponibles</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid="elevation-profile"
      className={className}
      onClick={handleContainerClick}
      style={isClickModeActive ? { cursor: 'crosshair' } : undefined}
    >
      {size.width > 0 && size.height > 0 && (
        <AreaChart
          width={size.width}
          height={size.height}
          data={points}
          margin={{ top: 4, right: 8, bottom: 16, left: 32 }}
          onMouseLeave={() => wrappedOnHoverKm(null)}
        >
          <XAxis
            dataKey="distKm"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
            unit=" km"
            tick={{ fontSize: 10 }}
            tickLine={false}
          />
          <YAxis
            dataKey="ele"
            tick={{ fontSize: 10 }}
            tickLine={false}
            width={28}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
          />
          <Tooltip content={<ElevationTooltip onHoverKm={wrappedOnHoverKm} />} isAnimationActive={false} />
          <Area
            dataKey="ele"
            fill="var(--primary-light, hsl(var(--primary) / 0.2))"
            stroke="var(--primary)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {searchRangeActive && searchFromKm != null && searchToKm != null && (
            <ReferenceArea
              x1={searchFromKm}
              x2={searchToKm}
              fill="#3498db"
              fillOpacity={0.2}
              stroke="none"
            />
          )}
          {boundaries.map((b) => (
            <ReferenceLine
              key={b.distKm}
              x={b.distKm}
              stroke="var(--border)"
              strokeDasharray="3 3"
              label={{ value: b.name, position: 'insideTopRight', fontSize: 9, fill: 'var(--text-muted)' }}
            />
          ))}
          {stagesVisible && stages?.map((stage) => (
            <ReferenceLine
              key={`stage-${stage.id}`}
              x={stage.endKm}
              stroke={stage.color}
              strokeWidth={1.5}
              label={{ value: stage.name, position: 'insideTopLeft', fontSize: 9, fill: stage.color }}
            />
          ))}
        </AreaChart>
      )}
    </div>
  )
}
