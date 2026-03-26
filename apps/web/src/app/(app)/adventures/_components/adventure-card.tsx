'use client'

import type { AdventureResponse } from '@ridenrest/shared'

interface AdventureCardProps {
  adventure: AdventureResponse
  isSelected: boolean
  onSelect: (id: string) => void
  onNavigate: (path: string) => void
}

export function AdventureCard({ adventure, isSelected, onSelect, onNavigate }: AdventureCardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-[--border] p-4 cursor-pointer transition-colors${isSelected ? ' ring-2 ring-[--primary]' : ''}`}
      onClick={() => onSelect(adventure.id)}
    >
      <div className="flex items-center justify-between">
        <span className="text-text-primary font-semibold">{adventure.name}</span>
        <span className="text-text-secondary text-sm">
          {adventure.totalDistanceKm > 0
            ? `${adventure.totalDistanceKm.toFixed(1)} km`
            : '—'}
        </span>
      </div>
      <div className="text-text-muted text-sm mt-1">
        {new Date(adventure.createdAt).toLocaleDateString('fr-FR')}
      </div>

      {/* Desktop action row — ≥ 1024px, always visible */}
      <div
        className="hidden lg:flex gap-2 mt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="px-5 py-2 bg-[var(--text-primary)] text-white rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          onClick={() => onNavigate(`/map/${adventure.id}?mode=planning`)}
        >
          Planning
        </button>
        <button
          type="button"
          className="px-5 py-2 border border-[--border] text-text-primary bg-white rounded-lg text-sm font-medium transition-colors hover:bg-[var(--surface-raised)]"
          onClick={() => onNavigate(`/adventures/${adventure.id}`)}
        >
          Modifier
        </button>
        <button
          type="button"
          className="px-5 py-2 bg-[var(--surface-raised)] text-text-primary rounded-lg text-sm font-medium transition-colors hover:bg-[var(--border)]"
          onClick={() => onNavigate(`/live/${adventure.id}`)}
        >
          Live
        </button>
      </div>

      {/* Mobile action rows — < 1024px, visible only when card is selected */}
      {isSelected && (
        <div
          className="block lg:hidden mt-3 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-5 py-2 bg-[var(--text-primary)] text-white rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            onClick={() => onNavigate(`/live/${adventure.id}`)}
          >
            Démarrer en Live
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 px-5 py-2 bg-[var(--surface-raised)] text-text-primary rounded-lg text-sm font-medium transition-colors hover:bg-[var(--border)]"
              onClick={() => onNavigate(`/map/${adventure.id}?mode=planning`)}
            >
              Planning
            </button>
            <button
              type="button"
              className="flex-1 px-5 py-2 border border-[--border] text-text-primary bg-transparent rounded-lg text-sm font-medium transition-colors hover:bg-[var(--surface-raised)]"
              onClick={() => onNavigate(`/adventures/${adventure.id}`)}
            >
              Modifier
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
