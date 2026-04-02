import { ZoomOut } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface ResetZoomButtonProps {
  onClick: () => void
}

export function ResetZoomButton({ onClick }: ResetZoomButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          onClick={onClick}
          className="w-10 h-10 rounded-xl bg-white border border-[--border] shadow-sm flex items-center justify-center hover:bg-white/90 active:scale-[0.90] transition-all duration-75 cursor-pointer"
          aria-label="Réinitialiser le zoom"
        >
          <ZoomOut className="w-4 h-4 text-foreground" />
        </TooltipTrigger>
        <TooltipContent side="left">Réinitialiser le zoom</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
