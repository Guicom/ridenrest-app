import { useQuery } from '@tanstack/react-query'
import { getReverseAddress } from '@/lib/api-client'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function useReverseAddress(
  center: { lat: number; lng: number } | null,
): { address: string | null; isPending: boolean } {
  const roundedKey = center
    ? `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`
    : null

  const { data, isPending } = useQuery({
    queryKey: ['reverseAddress', roundedKey],
    queryFn: () => getReverseAddress(center!.lat, center!.lng),
    enabled: center !== null,
    staleTime: SEVEN_DAYS_MS,
    gcTime: SEVEN_DAYS_MS,
  })

  return {
    address: data?.address ?? null,
    isPending: center !== null && isPending,
  }
}
