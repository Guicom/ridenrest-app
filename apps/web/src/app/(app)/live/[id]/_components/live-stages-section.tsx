'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import type { AdventureStageResponse } from '@ridenrest/shared'
import { StageCard } from '@/components/shared/stage-card'

interface LiveStagesSectionProps {
  stages: AdventureStageResponse[]
  currentKmOnRoute: number | null
  speedKmh: number
}

export function LiveStagesSection({ stages, currentKmOnRoute, speedKmh }: LiveStagesSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const currentRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to current stage when section is expanded or current stage changes
  useEffect(() => {
    if (expanded && currentRef.current?.scrollIntoView) {
      currentRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expanded, currentKmOnRoute])

  if (stages.length === 0) return null

  return (
    <div
      className="absolute bottom-[88px] left-4 right-4 z-20 rounded-xl border border-[--border] bg-background/90 backdrop-blur-sm"
      data-testid="live-stages-section"
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls="live-stages-list"
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } }}
        data-testid="live-stages-header"
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">Étapes ({stages.length})</span>
        </div>
        <span className="text-muted-foreground" aria-hidden="true">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>

      {/* Stage list */}
      {expanded && (
        <div id="live-stages-list" className="px-4 pb-3 flex flex-col gap-2 max-h-64 overflow-y-auto">
          {stages.map((stage) => {
            const isPassed = currentKmOnRoute !== null && currentKmOnRoute >= stage.endKm
            const isCurrent = currentKmOnRoute !== null && currentKmOnRoute >= stage.startKm && currentKmOnRoute < stage.endKm
            const hasPosition = currentKmOnRoute !== null && speedKmh > 0
            const etaFromCurrentMinutes = hasPosition && (isCurrent || !isPassed)
              ? Math.round(((stage.endKm - currentKmOnRoute!) / speedKmh) * 60)
              : null

            return (
              <div key={stage.id} ref={isCurrent ? currentRef : undefined}>
                <StageCard
                  stage={stage}
                  mode="live"
                  isCurrent={isCurrent}
                  isPassed={isPassed}
                  etaFromCurrentMinutes={etaFromCurrentMinutes}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
