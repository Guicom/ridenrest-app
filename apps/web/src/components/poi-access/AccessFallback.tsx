import { Badge } from '@/components/ui/badge'
import { SectionTooltip } from '@/components/shared/section-tooltip'
import { formatAccessDistance } from './format'

/**
 * Rendu de repli quand BRouter est indisponible (status `fallback`) : on affiche
 * la distance à vol d'oiseau, signalée comme approximative et visuellement discrète.
 */
interface AccessFallbackProps {
  fallbackDistanceM: number
}

export function AccessFallback({ fallbackDistanceM }: AccessFallbackProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="access-fallback">
      <span>{formatAccessDistance(fallbackDistanceM)}</span>
      <SectionTooltip content="BRouter indisponible — affichage de la distance à vol d'oiseau">
        <Badge variant="outline" className="text-muted-foreground">≈ approximatif</Badge>
      </SectionTooltip>
    </div>
  )
}
