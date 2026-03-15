'use client'
import { AlertCircle, MapPin } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

export interface SegmentCardProps {
  segment: AdventureSegmentResponse
  onRetry: () => void
}

export function SegmentCard({ segment, onRetry }: SegmentCardProps) {
  const { parseStatus, name, distanceKm, elevationGainM } = segment

  if (parseStatus === 'pending' || parseStatus === 'processing') {
    return (
      <div className="rounded-lg border p-4 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
        <p className="text-xs text-muted-foreground">
          {parseStatus === 'pending' ? "En attente d'analyse..." : 'Analyse en cours...'}
        </p>
      </div>
    )
  }

  if (parseStatus === 'error') {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">{name ?? 'Segment sans nom'}</span>
        </div>
        <p className="text-xs text-destructive">
          Parsing échoué — vérifiez le format du fichier GPX
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      </div>
    )
  }

  // parseStatus === 'done'
  const distanceLabel = distanceKm != null ? `${distanceKm.toFixed(1)} km` : '— km'
  const elevationLabel = elevationGainM != null ? `${Math.round(elevationGainM)}m D+` : 'N/A'

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{name ?? 'Segment sans nom'}</span>
        <Badge variant="secondary">Analysé</Badge>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{distanceLabel}</span>
        <span>{elevationLabel}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Disponible dans la version carte"
      >
        <MapPin className="h-3 w-3 mr-1" />
        Afficher sur la carte
      </Button>
    </div>
  )
}
