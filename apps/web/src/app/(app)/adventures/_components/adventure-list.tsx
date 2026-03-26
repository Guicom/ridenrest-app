'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Bike } from 'lucide-react'
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

  return (
    <div className="space-y-3">
      {adventures.map((adventure) => (
        <AdventureCard
          key={adventure.id}
          adventure={adventure}
          isSelected={adventure.id === selectedId}
          onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          onNavigate={(path) => router.push(path)}
        />
      ))}
    </div>
  )
}
