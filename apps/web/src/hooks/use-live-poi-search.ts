import { useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLiveStore } from '@/stores/live.store'
import { getLivePois } from '@/lib/api-client'
import type { Poi } from '@ridenrest/shared'

const TRIGGER_THRESHOLD_KM = 0.5

export function useLivePoisSearch(segmentId: string | undefined) {
  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive)
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)
  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm)

  const lastTriggerKmRef = useRef<number | null>(null)
  const [activeTriggerKm, setActiveTriggerKm] = useState<number | null>(null)

  // Update activeTriggerKm when GPS moves >= 500m
  useEffect(() => {
    if (currentKmOnRoute === null) return

    const shouldTrigger =
      lastTriggerKmRef.current === null ||
      Math.abs(currentKmOnRoute - lastTriggerKmRef.current) >= TRIGGER_THRESHOLD_KM

    if (shouldTrigger) {
      lastTriggerKmRef.current = currentKmOnRoute
      setActiveTriggerKm(currentKmOnRoute)
    }
  }, [currentKmOnRoute])

  // Also trigger when sliders change
  useEffect(() => {
    if (currentKmOnRoute !== null) setActiveTriggerKm(currentKmOnRoute)
  }, [targetAheadKm, searchRadiusKm]) // eslint-disable-line react-hooks/exhaustive-deps

  const targetKm = activeTriggerKm !== null
    ? Math.round((activeTriggerKm + targetAheadKm) * 10) / 10
    : null

  const { data: pois = [], isPending } = useQuery<Poi[]>({
    queryKey: ['pois', 'live', { segmentId, targetKm, radiusKm: searchRadiusKm }],
    queryFn: () => getLivePois({
      segmentId: segmentId!,
      targetKm: targetKm!,
      radiusKm: searchRadiusKm,
    }),
    enabled: isLiveModeActive && targetKm !== null && !!segmentId,
    staleTime: 5 * 60 * 1000, // 5 min
  })

  return { pois, isPending, targetKm }
}
