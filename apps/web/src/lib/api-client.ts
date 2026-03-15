import { authClient } from '@/lib/auth/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3010'

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function invalidateAuthTokenCache(): void {
  // No-op — authClient.getToken() handles caching internally
}

// Use Better Auth jwtClient plugin to get JWT — handles session cookie + caching
async function getAuthToken(): Promise<string | null> {
  try {
    const result = await authClient.token()
    // Better Auth jwtClient returns either { data: { token } } or { data: tokenString }
    const data = result?.data
    if (typeof data === 'string') return data
    if (data && typeof data === 'object' && 'token' in data) return (data as { token: string }).token
    return null
  } catch {
    return null
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const token = await getAuthToken()

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    credentials: 'include', // Send session cookies for same-site requests
  })

  if (!res.ok) {
    if (res.status === 401) {
      // Token expired — next call to getAuthToken() will fetch a fresh one
    }
    const body = await res.json().catch(() => ({}))
    throw new ApiError(
      body?.error?.message ?? `HTTP ${res.status}`,
      res.status,
      body?.error?.code,
    )
  }

  const body = await res.json()
  return body.data as T // Unwrap ResponseInterceptor { data: ... }
}

// ── Adventures ───────────────────────────────────────────────────────────────

import type { AdventureResponse, AdventureSegmentResponse, AdventureMapResponse, MapSegmentData, MapWaypoint } from '@ridenrest/shared'

export async function createAdventure(name: string): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>('/api/adventures', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function listAdventures(): Promise<AdventureResponse[]> {
  return apiFetch<AdventureResponse[]>('/api/adventures')
}

export async function getAdventure(id: string): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>(`/api/adventures/${id}`)
}

// ── Segments ──────────────────────────────────────────────────────────────────

export async function listSegments(adventureId: string): Promise<AdventureSegmentResponse[]> {
  return apiFetch<AdventureSegmentResponse[]>(`/api/adventures/${adventureId}/segments`)
}

export async function createSegment(
  adventureId: string,
  file: File,
  name?: string,
): Promise<AdventureSegmentResponse> {
  const formData = new FormData()
  formData.append('file', file)
  if (name) formData.append('name', name)

  return apiFetch<AdventureSegmentResponse>(`/api/adventures/${adventureId}/segments`, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type — browser sets it with multipart boundary
  })
}

export async function reorderSegments(
  adventureId: string,
  orderedIds: string[],
): Promise<AdventureSegmentResponse[]> {
  return apiFetch<AdventureSegmentResponse[]>(`/api/adventures/${adventureId}/segments/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ orderedIds }),
  })
}

export async function deleteSegment(adventureId: string, segmentId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/adventures/${adventureId}/segments/${segmentId}`, {
    method: 'DELETE',
  })
}

export async function renameAdventure(adventureId: string, name: string): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>(`/api/adventures/${adventureId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export async function renameSegment(
  adventureId: string,
  segmentId: string,
  name: string,
): Promise<AdventureSegmentResponse> {
  return apiFetch<AdventureSegmentResponse>(`/api/adventures/${adventureId}/segments/${segmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export async function deleteAdventure(adventureId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/adventures/${adventureId}`, {
    method: 'DELETE',
  })
}

export async function getAdventureMapData(adventureId: string): Promise<AdventureMapResponse> {
  return apiFetch<AdventureMapResponse>(`/api/adventures/${adventureId}/map`)
}

export type { AdventureMapResponse, MapSegmentData, MapWaypoint }

// ── Strava ────────────────────────────────────────────────────────────────────

export interface StravaRouteItem {
  id: string          // Strava route ID (numeric as string)
  name: string
  distanceKm: number
  elevationGainM: number | null
}

export async function listStravaRoutes(): Promise<StravaRouteItem[]> {
  return apiFetch<StravaRouteItem[]>('/api/strava/routes')
}

export async function importStravaRoute(
  stravaRouteId: string,
  adventureId: string,
): Promise<AdventureSegmentResponse> {
  return apiFetch<AdventureSegmentResponse>(`/api/strava/routes/${stravaRouteId}/import`, {
    method: 'POST',
    body: JSON.stringify({ adventureId }),
  })
}

export const apiClient = {
  get: <T>(path: string, init?: RequestInit) =>
    apiFetch<T>(path, { ...init, method: 'GET' }),

  post: <T>(path: string, data: unknown, init?: RequestInit) =>
    apiFetch<T>(path, {
      ...init,
      method: 'POST',
      body: JSON.stringify(data),
    }),

  patch: <T>(path: string, data: unknown, init?: RequestInit) =>
    apiFetch<T>(path, {
      ...init,
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: <T>(path: string, init?: RequestInit) =>
    apiFetch<T>(path, { ...init, method: 'DELETE' }),
}
