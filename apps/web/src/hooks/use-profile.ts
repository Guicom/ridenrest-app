import { useQuery } from '@tanstack/react-query'
import { getProfile } from '@/lib/api-client'

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
  })
}

/**
 * Overpass opt-in + whether that value can be trusted yet.
 *
 * `profile?.overpassEnabled ?? false` is a trap for anything that FETCHES: while the profile
 * request is in flight the flag reads `false`, so POI queries fire with Overpass OFF, then fire
 * a second time with ON once the profile lands. Observed cost (bug 2026-08-19): a full — and
 * expensive — Google prefetch under the OFF key, the OFF result rendered first, and a toggle
 * that looks like it has no effect at all. Callers that fetch must gate on `ready`.
 *
 * `ready` is true as soon as the value is settled, including on error (fall back to OFF) and
 * when the query is `paused` (offline with no cached profile) — a search must never be blocked
 * forever waiting for a profile that cannot arrive.
 */
export function useOverpassEnabled(): { overpassEnabled: boolean; ready: boolean } {
  const query = useProfile()
  return {
    overpassEnabled: query.data?.overpassEnabled ?? false,
    ready: query.isSuccess || query.isError || query.fetchStatus === 'paused',
  }
}
