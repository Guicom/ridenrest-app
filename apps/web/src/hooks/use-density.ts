import { useQuery } from '@tanstack/react-query'
import { getDensityStatus } from '@/lib/api-client'
import type { CoverageGapSummary, DensityStatus } from '@ridenrest/shared'

interface UseDensityResult {
  coverageGaps: CoverageGapSummary[]
  densityStatus: DensityStatus
  densityCategories: string[]
  densityStale: boolean
  isPending: boolean
}

export function useDensity(adventureId: string): UseDensityResult {
  const { data, isPending } = useQuery({
    queryKey: ['density', adventureId],
    queryFn: () => getDensityStatus(adventureId),
    refetchInterval: (q) => {
      const status = q.state.data?.densityStatus ?? ''
      return ['pending', 'processing'].includes(status) ? 3000 : false
    },
    enabled: !!adventureId,
  })

  return {
    coverageGaps: data?.coverageGaps ?? [],
    densityStatus: data?.densityStatus ?? 'idle',
    densityCategories: data?.densityCategories ?? [],
    densityStale: data?.densityStale ?? false,
    isPending,
  }
}
