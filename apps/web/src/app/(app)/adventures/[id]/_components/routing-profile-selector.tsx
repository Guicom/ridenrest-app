'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ROUTING_PROFILE_LABELS,
  ROUTING_PROFILE_TOOLTIPS,
  ROUTING_PROFILE_VALUES,
  type AdventureResponse,
  type RoutingProfile,
} from '@ridenrest/shared'
import { updateAdventureRoutingProfile } from '@/lib/api-client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SectionTooltip } from '@/components/shared/section-tooltip'

interface Props {
  adventureId: string
  currentProfile: RoutingProfile
}

// Tooltip combiné (AC1) construit depuis la source de vérité partagée.
const PROFILE_TOOLTIP = ROUTING_PROFILE_VALUES.map((p) => ROUTING_PROFILE_TOOLTIPS[p]).join(' ')

/**
 * Sélecteur de profil de routage cyclable d'une aventure (Story POI-Access 2.6).
 *
 * - Optimistic UI : la valeur affichée est pilotée par le cache TanStack
 *   `['adventures', adventureId]` ; `onMutate` met le cache à jour immédiatement,
 *   `onError` effectue un rollback vers la valeur précédente.
 * - Au succès, invalide `['poi-access']` (préfixe) → tous les `useAccess` actifs
 *   recalculent les itinéraires avec le nouveau profil.
 */
export function RoutingProfileSelector({ adventureId, currentProfile }: Props) {
  const queryClient = useQueryClient()
  const adventureKey = ['adventures', adventureId] as const

  const mutation = useMutation({
    mutationFn: (newProfile: RoutingProfile) => updateAdventureRoutingProfile(adventureId, newProfile),
    onMutate: async (newProfile) => {
      await queryClient.cancelQueries({ queryKey: adventureKey })
      const previous = queryClient.getQueryData<AdventureResponse>(adventureKey)
      if (previous) {
        queryClient.setQueryData<AdventureResponse>(adventureKey, { ...previous, routingProfile: newProfile })
      }
      return { previous }
    },
    onError: (_err, _newProfile, context) => {
      if (context?.previous) {
        queryClient.setQueryData(adventureKey, context.previous)
      }
      toast.error('Échec de la sauvegarde du profil de routage')
    },
    onSuccess: () => {
      toast.success('Profil de routage mis à jour')
      // Recalcul des métriques d'accès POI avec le nouveau profil.
      queryClient.invalidateQueries({ queryKey: ['poi-access'] })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adventureKey })
    },
  })

  function handleChange(value: RoutingProfile | null) {
    if (value === null || value === currentProfile) return
    mutation.mutate(value)
  }

  return (
    <div className="space-y-2">
      <SectionTooltip content={PROFILE_TOOLTIP}>
        <span className="text-sm font-medium text-text-primary">Profil de routage cyclable</span>
      </SectionTooltip>
      <Select
        items={ROUTING_PROFILE_LABELS}
        value={currentProfile}
        onValueChange={handleChange}
        disabled={mutation.isPending}
      >
        <SelectTrigger className="w-full sm:w-64" aria-label="Profil de routage cyclable">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROUTING_PROFILE_VALUES.map((profile) => (
            <SelectItem key={profile} value={profile}>
              {ROUTING_PROFILE_LABELS[profile]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
