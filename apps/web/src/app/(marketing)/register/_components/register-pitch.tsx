import { Check } from 'lucide-react'

const benefits = [
  'Import GPX depuis Strava',
  'Hébergements et ravitaillements sur ta trace',
  'Météo adaptée à ton pace',
]

export function RegisterPitch() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">
        Gratuit · Sans carte bancaire
      </p>
      <ul className="space-y-1">
        {benefits.map((b) => (
          <li key={b} className="flex items-center gap-2 text-sm text-foreground">
            <Check className="h-4 w-4 text-primary shrink-0" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  )
}
