import { QueryClient } from '@tanstack/react-query'

// Singleton for client-side — one instance per browser tab
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute — data considered fresh
        gcTime: 10 * 60 * 1000, // 10 minutes — cache retention
        retry: 1, // Retry once on failure
        refetchOnWindowFocus: false, // Don't refetch on tab switch (explicit control)
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient()
  }
  // Browser: reuse singleton
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}
