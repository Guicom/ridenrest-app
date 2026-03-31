'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Bike, ChevronDown } from 'lucide-react'
import { listAdventures } from '@/lib/api-client'
import { CreateAdventureButton } from './create-adventure-button'
import { AdventureCard } from './adventure-card'

export function AdventureListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse h-24 bg-surface rounded-xl border border-[--border]" />
      ))}
    </div>
  )
}

export function AdventureList() {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPastExpanded, setIsPastExpanded] = useState(false)
  const { data: adventures = [], isPending, isError } = useQuery({
    queryKey: ['adventures'],
    queryFn: listAdventures,
  })

  if (isPending) {
    return <AdventureListSkeleton />
  }

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-text-muted mb-2">Impossible de charger les aventures.</p>
        <p className="text-sm text-text-muted">Vérifiez votre connexion et réessayez.</p>
      </div>
    )
  }

  if (adventures.length === 0) {
    return (
      <div className="text-center py-16">
        <Bike className="mx-auto mb-4 text-text-muted" size={48} />
        <h2 className="text-xl font-semibold text-text-primary mb-2">Aucune aventure</h2>
        <p className="text-text-muted mb-6">Créez votre première aventure pour commencer.</p>
        <CreateAdventureButton />
      </div>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Parse YYYY-MM-DD as local midnight (not UTC) to avoid off-by-one-day for UTC- users
  const parseLocalDate = (d: string) => new Date(d + 'T00:00:00')

  const upcoming = adventures
    .filter((a) =>
      a.status === 'active' ||
      !a.startDate ||
      parseLocalDate(a.startDate) >= today,
    )
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1
      if (b.status === 'active' && a.status !== 'active') return 1
      if (!a.startDate && !b.startDate) return 0
      if (!a.startDate) return 1
      if (!b.startDate) return -1
      return parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()
    })

  const past = adventures
    .filter((a) =>
      a.status !== 'active' &&
      !!a.startDate &&
      parseLocalDate(a.startDate) < today,
    )
    .sort((a, b) =>
      parseLocalDate(b.startDate!).getTime() - parseLocalDate(a.startDate!).getTime(),
    )

  return (
    <div>
      <div className="space-y-3">
        {upcoming.map((adventure) => (
          <AdventureCard
            key={adventure.id}
            adventure={adventure}
            isSelected={adventure.id === selectedId}
            onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
            onNavigate={(path) => router.push(path)}
          />
        ))}
      </div>
      {past.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            className="flex items-center gap-2 text-sm text-text-muted mb-2 w-full"
            onClick={() => setIsPastExpanded((v) => !v)}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isPastExpanded ? 'rotate-180' : ''}`} />
            Aventures passées ({past.length})
          </button>
          {isPastExpanded && (
            <div className="space-y-3 opacity-75">
              {past.map((adventure) => (
                <AdventureCard
                  key={adventure.id}
                  adventure={adventure}
                  isSelected={adventure.id === selectedId}
                  onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
                  onNavigate={(path) => router.push(path)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
