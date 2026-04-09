'use client'

import { useRef, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import type { AdventureResponse } from '@ridenrest/shared'

interface AdventureCardProps {
  adventure: AdventureResponse
  isSelected: boolean
  onSelect: (id: string) => void
  onNavigate: (path: string) => void
}

export function AdventureCard({ adventure, isSelected, onSelect, onNavigate }: AdventureCardProps) {
  const [isPending, startTransition] = useTransition()
  const pendingPathRef = useRef<string | null>(null)

  const handleNavigate = (path: string) => {
    pendingPathRef.current = path
    startTransition(() => {
      onNavigate(path)
    })
  }

  const isNavigating = (path: string) => isPending && pendingPathRef.current === path

  return (
    <div
      className={`bg-white rounded-xl border border-[--border] p-4 transition-all duration-75 hover:bg-[--surface-raised] active:scale-[0.98]${isSelected ? ' ring-2 ring-[--primary]' : ''}`}
      onClick={() => onSelect(adventure.id)}
    >
      <div className="flex items-center justify-between">
        <span className="text-text-primary font-semibold">{adventure.name}</span>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-text-secondary text-sm">
            {adventure.totalDistanceKm > 0 ? `${adventure.totalDistanceKm.toFixed(1)} km` : '—'}
          </span>
          {adventure.totalElevationGainM != null && adventure.totalElevationGainM > 0 && (
            <span className="text-text-secondary text-sm">
              ↑ {Math.round(adventure.totalElevationGainM).toLocaleString('fr-FR')} m
            </span>
          )}
          {adventure.hasStravaSegment && (
            <img src="/powered-by-strava.svg" alt="Powered by Strava" className="h-4" />
          )}
        </div>
      </div>
      <div className="text-text-muted text-sm mt-1">
        {adventure.startDate
          ? adventure.endDate
            ? `${new Date(adventure.startDate + 'T00:00:00').toLocaleDateString('fr-FR')} → ${new Date(adventure.endDate + 'T00:00:00').toLocaleDateString('fr-FR')}`
            : new Date(adventure.startDate + 'T00:00:00').toLocaleDateString('fr-FR')
          : new Date(adventure.createdAt).toLocaleDateString('fr-FR')}
      </div>

      {/* Desktop action row — ≥ 1024px, always visible */}
      <div
        className="hidden lg:flex gap-2 mt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={isPending}
          className="px-5 py-2 bg-[var(--text-primary)] text-white rounded-lg text-sm font-medium transition-all duration-75 hover:opacity-90 active:scale-[0.97] cursor-pointer disabled:opacity-70 inline-flex items-center gap-2"
          onClick={() => handleNavigate(`/map/${adventure.id}?mode=planning`)}
        >
          {isNavigating(`/map/${adventure.id}?mode=planning`) && <Loader2 className="h-4 w-4 animate-spin" />}
          Planning
        </button>
        <button
          type="button"
          disabled={isPending}
          className="px-5 py-2 border border-[--border] text-text-primary bg-white rounded-lg text-sm font-medium transition-all duration-75 hover:bg-[var(--surface-raised)] active:scale-[0.97] cursor-pointer disabled:opacity-70 inline-flex items-center gap-2"
          onClick={() => handleNavigate(`/adventures/${adventure.id}`)}
        >
          {isNavigating(`/adventures/${adventure.id}`) && <Loader2 className="h-4 w-4 animate-spin" />}
          Modifier
        </button>
        <button
          type="button"
          disabled={isPending}
          className="px-5 py-2 bg-[var(--surface-raised)] text-text-primary rounded-lg text-sm font-medium transition-all duration-75 hover:bg-[var(--border)] active:scale-[0.97] cursor-pointer disabled:opacity-70 inline-flex items-center gap-2"
          onClick={() => handleNavigate(`/live/${adventure.id}`)}
        >
          {isNavigating(`/live/${adventure.id}`) && <Loader2 className="h-4 w-4 animate-spin" />}
          Live
        </button>
      </div>

      {/* Mobile action rows — < 1024px, always visible */}
      <div
        className="block lg:hidden mt-3 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={isPending}
          className="w-full px-5 py-2 bg-[var(--text-primary)] text-white rounded-lg text-sm font-medium transition-all duration-75 hover:opacity-90 active:scale-[0.97] cursor-pointer disabled:opacity-70 inline-flex items-center justify-center gap-2"
          onClick={() => handleNavigate(`/live/${adventure.id}`)}
        >
          {isNavigating(`/live/${adventure.id}`) && <Loader2 className="h-4 w-4 animate-spin" />}
          Démarrer en Live
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            className="flex-1 px-5 py-2 bg-[var(--surface-raised)] text-text-primary rounded-lg text-sm font-medium transition-all duration-75 hover:bg-[var(--border)] active:scale-[0.97] cursor-pointer disabled:opacity-70 inline-flex items-center justify-center gap-2"
            onClick={() => handleNavigate(`/map/${adventure.id}?mode=planning`)}
          >
            {isNavigating(`/map/${adventure.id}?mode=planning`) && <Loader2 className="h-4 w-4 animate-spin" />}
            Planning
          </button>
          <button
            type="button"
            disabled={isPending}
            className="flex-1 px-5 py-2 border border-[--border] text-text-primary bg-transparent rounded-lg text-sm font-medium transition-all duration-75 hover:bg-[var(--surface-raised)] active:scale-[0.97] cursor-pointer disabled:opacity-70 inline-flex items-center justify-center gap-2"
            onClick={() => handleNavigate(`/adventures/${adventure.id}`)}
          >
            {isNavigating(`/adventures/${adventure.id}`) && <Loader2 className="h-4 w-4 animate-spin" />}
            Modifier
          </button>
        </div>
      </div>
    </div>
  )
}
