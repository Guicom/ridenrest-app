import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AdventureStageResponse } from '@ridenrest/shared'
import { computeEndDateFromStages } from '@/lib/compute-end-date'
import { updateAdventureEndDate } from '@/lib/api-client'

interface UseEndDateSyncResult {
  proposedDate: string | null
  isPending: boolean
  /** Call after stage mutations have resolved and cache is fresh */
  triggerCheck: () => void
  confirmUpdate: () => Promise<void>
  dismiss: () => void
}

export function useEndDateSync(
  adventureId: string,
  currentEndDate: string | null,
): UseEndDateSyncResult {
  const queryClient = useQueryClient()
  const [proposedDate, setProposedDate] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const triggerCheck = useCallback(() => {
    // Read directly from TanStack Query cache — must be called after refetchQueries completes
    const freshStages =
      queryClient.getQueryData<AdventureStageResponse[]>(['adventures', adventureId, 'stages']) ?? []
    const computed = computeEndDateFromStages(freshStages)
    if (computed && computed !== currentEndDate) {
      setProposedDate(computed)
    }
  }, [adventureId, currentEndDate, queryClient])

  const confirmUpdate = useCallback(async () => {
    if (!proposedDate) return
    setIsPending(true)
    try {
      await updateAdventureEndDate(adventureId, proposedDate)
      await queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
      await queryClient.invalidateQueries({ queryKey: ['adventures'] })
      setProposedDate(null)
    } finally {
      setIsPending(false)
    }
  }, [adventureId, proposedDate, queryClient])

  const dismiss = useCallback(() => {
    setProposedDate(null)
  }, [])

  return { proposedDate, isPending, triggerCheck, confirmUpdate, dismiss }
}
