import { useQuery } from '@tanstack/react-query'
import { getPoiGoogleDetails } from '@/lib/api-client'
import type { GooglePlaceDetails } from '@ridenrest/shared'

export function usePoiGoogleDetails(
  externalId: string | null,
  segmentId: string | null,
): { details: GooglePlaceDetails | null; isPending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ['pois', externalId, 'google-details', segmentId],
    queryFn: () => getPoiGoogleDetails(externalId!, segmentId!),
    enabled: !!externalId && !!segmentId,
    staleTime: 1000 * 60 * 60 * 24 * 7,  // 7 days — matches Redis TTL
    retry: false,  // Enrichment is optional — no retry on failure
  })

  return { details: data ?? null, isPending: isPending && !!externalId }
}
