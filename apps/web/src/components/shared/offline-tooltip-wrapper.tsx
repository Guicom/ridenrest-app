'use client'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useOfflineGate } from '@/hooks/use-offline-ready'

interface OfflineTooltipWrapperProps {
  children: React.ReactElement
  className?: string
}

/**
 * Wraps a button/element to show a tooltip and visual disable state when offline.
 * Uses asChild + <div> wrapper to avoid nested <button> elements (invalid HTML).
 * Intercepts click, pointerdown, and mousedown to block all interaction paths.
 */
export function OfflineTooltipWrapper({
  children,
  className,
}: OfflineTooltipWrapperProps) {
  const { isOnline, disabledReason } = useOfflineGate()

  if (isOnline) return children

  const blockEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<div />}
          className={`opacity-50 cursor-not-allowed ${className ?? ''}`}
          onClickCapture={blockEvent}
          onPointerDownCapture={blockEvent}
          onMouseDownCapture={blockEvent}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
