'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { listAdventures, createAdventure } from '@/lib/api-client'
import { CreateAdventureDialog } from './create-adventure-dialog'

export function AdventureList() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: adventures = [], isPending } = useQuery({
    queryKey: ['adventures'],
    queryFn: listAdventures,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createAdventure(name),
    onSuccess: (adventure) => {
      queryClient.invalidateQueries({ queryKey: ['adventures'] })
      router.push(`/adventures/${adventure.id}`)
    },
  })

  if (isPending) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-20 bg-muted rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CreateAdventureDialog
        onSubmit={(name) => createMutation.mutate(name)}
        isPending={createMutation.isPending}
      />

      {adventures.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Aucune aventure pour l&apos;instant.</p>
          <p className="text-sm mt-1">Créez votre première aventure ci-dessus.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adventures.map((adventure) => (
            <button
              key={adventure.id}
              onClick={() => router.push(`/adventures/${adventure.id}`)}
              className="w-full text-left p-4 border rounded-lg hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{adventure.name}</span>
                <span className="text-sm text-muted-foreground">
                  {adventure.totalDistanceKm > 0
                    ? `${adventure.totalDistanceKm.toFixed(1)} km`
                    : 'Distance à calculer'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(adventure.createdAt).toLocaleDateString('fr-FR')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
