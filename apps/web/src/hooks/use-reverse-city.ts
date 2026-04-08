import { useQuery } from '@tanstack/react-query'
import { getReverseCity } from '@/lib/api-client'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function useReverseCity(
  center: { lat: number; lng: number } | null,
): { city: string | null; postcode: string | null; state: string | null; country: string | null; isPending: boolean } {
  const roundedKey = center
    ? `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`
    : null

  const { data, isPending } = useQuery({
    queryKey: ['reverseCity', roundedKey],
    queryFn: () => getReverseCity(center!.lat, center!.lng),
    enabled: center !== null,
    staleTime: SEVEN_DAYS_MS,
    gcTime: SEVEN_DAYS_MS,
  })

  return {
    city: data?.city ?? null,
    postcode: data?.postcode ?? null,
    state: data?.state ?? null,
    country: data?.country ?? null,
    isPending: center !== null && isPending,
  }
}
