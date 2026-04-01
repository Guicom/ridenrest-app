'use client'

import { useState, useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateOverpassEnabled } from '../actions'

interface OverpassToggleProps {
  initialEnabled: boolean
}

export function OverpassToggle({ initialEnabled }: OverpassToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()
  const queryClient = useQueryClient()

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      await updateOverpassEnabled(next)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="font-medium">Recherche étendue (Overpass)</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Les résultats sont plus complets — notamment pour les campings et refuges — mais les recherches prennent plus de temps.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={handleToggle}
        disabled={isPending}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50',
          enabled ? 'bg-[var(--primary)]' : 'bg-input',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
