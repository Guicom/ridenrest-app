'use client'
import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface SectionTooltipProps {
  content: string
  children: React.ReactNode
}

export function SectionTooltip({ content, children }: SectionTooltipProps) {
  const [open, setOpen] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  // Cleanup on unmount — avoids timer leaks (React Strict Mode safety)
  useEffect(() => {
    return () => {
      clearLongPress()
      clearClose()
    }
  }, [])

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          onMouseEnter={() => {
            clearClose()
            setOpen(true)
          }}
          onMouseLeave={() => {
            // Delay close to allow mouse to move from trigger to tooltip content
            closeTimer.current = setTimeout(() => setOpen(false), 150)
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') {
              longPressTimer.current = setTimeout(() => setOpen(true), 500)
            }
          }}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
        >
          <span className="flex items-center gap-1.5">
            {children}
            <Info className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-center">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
