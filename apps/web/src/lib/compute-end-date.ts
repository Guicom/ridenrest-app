import type { AdventureStageResponse } from '@ridenrest/shared'

export function computeEndDateFromStages(stages: AdventureStageResponse[]): string | null {
  if (stages.length === 0) return null
  const sorted = [...stages].sort((a, b) => a.orderIndex - b.orderIndex)
  const last = sorted.at(-1)!
  if (!last.departureTime || !last.etaMinutes) return null
  const arrival = new Date(new Date(last.departureTime).getTime() + last.etaMinutes * 60 * 1000)
  return arrival.toISOString().split('T')[0]
}
