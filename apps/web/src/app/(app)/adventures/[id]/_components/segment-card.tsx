import type { AdventureSegmentResponse, ParseStatus } from '@ridenrest/shared'

const STATUS_LABELS: Record<ParseStatus, string> = {
  pending: 'En attente...',
  processing: 'Analyse en cours...',
  done: 'Analysé',
  error: "Erreur d'analyse",
}

const STATUS_COLORS: Record<ParseStatus, string> = {
  pending: 'text-muted-foreground',
  processing: 'text-blue-600',
  done: 'text-green-600',
  error: 'text-destructive',
}

interface Props {
  segment: AdventureSegmentResponse
}

export function SegmentCard({ segment }: Props) {
  return (
    <div className="border rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{segment.name}</p>
        <p className="text-xs text-muted-foreground">
          {segment.cumulativeStartKm > 0
            ? `Début à ${segment.cumulativeStartKm.toFixed(1)} km`
            : 'Début'}
        </p>
      </div>

      <div className="text-right flex-shrink-0 space-y-0.5">
        {segment.parseStatus === 'done' ? (
          <>
            <p className="text-sm font-medium">
              {segment.distanceKm.toFixed(1)} km
            </p>
            <p className="text-xs text-muted-foreground">
              {segment.elevationGainM != null
                ? `D+ ${Math.round(segment.elevationGainM)} m`
                : 'D+ N/A'}
            </p>
          </>
        ) : (
          <p className={`text-xs ${STATUS_COLORS[segment.parseStatus]}`}>
            {STATUS_LABELS[segment.parseStatus]}
            {segment.parseStatus === 'pending' || segment.parseStatus === 'processing' ? (
              <span className="animate-pulse"> ●</span>
            ) : null}
          </p>
        )}
      </div>
    </div>
  )
}
