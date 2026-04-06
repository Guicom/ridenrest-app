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
