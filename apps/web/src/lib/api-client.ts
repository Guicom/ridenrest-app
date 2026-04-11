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

// In-memory JWT cache — avoids a network round-trip to /api/auth/token before every API call.
// This also prevents concurrent HTTP/2 requests (token + actual call) that can cause stream resets.
let cachedToken: string | null = null
let cachedTokenExp = 0

export function invalidateAuthTokenCache(): void {
  cachedToken = null
  cachedTokenExp = 0
}

function parseJwtExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!))
    return (payload.exp ?? 0) * 1000 // seconds → ms
  } catch {
    return 0
  }
}

async function getAuthToken(): Promise<string | null> {
  // Return cached token if still valid (with 30s safety margin)
  if (cachedToken && cachedTokenExp > Date.now() + 30_000) {
    return cachedToken
  }
  try {
    const result = await authClient.token()
    const data = result?.data
    const token = typeof data === 'string'
      ? data
      : (data && typeof data === 'object' && 'token' in data)
        ? (data as { token: string }).token
        : null
    if (token) {
      cachedToken = token
      cachedTokenExp = parseJwtExp(token)
    }
    return token
  } catch {
    cachedToken = null
    cachedTokenExp = 0
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
      invalidateAuthTokenCache()
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

export async function updateAdventureStartDate(id: string, startDate: string | null): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>(`/api/adventures/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ startDate }),
  })
}

export async function updateAdventureEndDate(id: string, endDate: string | null): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>(`/api/adventures/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ endDate }),
  })
}

export async function updateAdventureAvgSpeedKmh(id: string, avgSpeedKmh: number): Promise<AdventureResponse> {
  return apiFetch<AdventureResponse>(`/api/adventures/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ avgSpeedKmh }),
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

// ── Stages ────────────────────────────────────────────────────────────────────

import type { AdventureStageResponse, CreateStageInput, UpdateStageInput } from '@ridenrest/shared'

export async function getStages(adventureId: string): Promise<AdventureStageResponse[]> {
  return apiFetch<AdventureStageResponse[]>(`/api/adventures/${adventureId}/stages`)
}

export async function createStage(
  adventureId: string,
  data: CreateStageInput,
): Promise<AdventureStageResponse> {
  return apiFetch<AdventureStageResponse>(`/api/adventures/${adventureId}/stages`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateStage(
  adventureId: string,
  stageId: string,
  data: UpdateStageInput,
): Promise<AdventureStageResponse> {
  return apiFetch<AdventureStageResponse>(`/api/adventures/${adventureId}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteStage(adventureId: string, stageId: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/api/adventures/${adventureId}/stages/${stageId}`, {
    method: 'DELETE',
  })
}

export type { AdventureStageResponse, CreateStageInput, UpdateStageInput }

// ── Profile ───────────────────────────────────────────────────────────────────

export interface ProfileResponse {
  overpassEnabled: boolean
  tier: 'free' | 'pro' | 'team'
}

export async function getProfile(): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>('/api/profile')
}

// ── POIs ──────────────────────────────────────────────────────────────────────

import type { Poi, PoiCategory } from '@ridenrest/shared'

export interface GetPoisParams {
  segmentId: string
  fromKm: number
  toKm: number
  categories?: PoiCategory[]
  overpassEnabled?: boolean
}

export async function getPois(params: GetPoisParams): Promise<Poi[]> {
  const searchParams = new URLSearchParams({
    segmentId: params.segmentId,
    fromKm: String(params.fromKm),
    toKm: String(params.toKm),
  })
  if (params.categories && params.categories.length > 0) {
    params.categories.forEach((c) => searchParams.append('categories', c))
  }
  if (params.overpassEnabled) {
    searchParams.set('overpassEnabled', 'true')
  }
  return apiFetch<Poi[]>(`/api/pois?${searchParams.toString()}`)
}

export interface GetLivePoisParams {
  segmentId: string
  targetKm: number
  radiusKm: number
  categories?: PoiCategory[]
  overpassEnabled?: boolean
}

export async function getLivePois(params: GetLivePoisParams): Promise<Poi[]> {
  const searchParams = new URLSearchParams({
    segmentId: params.segmentId,
    targetKm: String(params.targetKm),
    radiusKm: String(params.radiusKm),
  })
  if (params.categories && params.categories.length > 0) {
    params.categories.forEach((c) => searchParams.append('categories', c))
  }
  if (params.overpassEnabled) {
    searchParams.set('overpassEnabled', 'true')
  }
  return apiFetch<Poi[]>(`/api/pois?${searchParams.toString()}`)
}

export type { Poi, PoiCategory }

// ── POI Google Details ────────────────────────────────────────────────────────

import type { GooglePlaceDetails } from '@ridenrest/shared'

export async function getPoiGoogleDetails(
  externalId: string,
  segmentId: string,
): Promise<GooglePlaceDetails | null> {
  try {
    return await apiFetch<GooglePlaceDetails>(
      `/api/pois/google-details?externalId=${encodeURIComponent(externalId)}&segmentId=${encodeURIComponent(segmentId)}`,
    )
  } catch {
    return null  // Enrichment is optional — never throw to caller
  }
}

export type { GooglePlaceDetails }

// ── Strava ────────────────────────────────────────────────────────────────────

export interface StravaRouteItem {
  id: string          // Strava route ID (numeric as string)
  name: string
  distanceKm: number
  elevationGainM: number | null
}

export async function listStravaRoutes(page: number = 1): Promise<StravaRouteItem[]> {
  return apiFetch<StravaRouteItem[]>(`/api/strava/routes?page=${page}`)
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

// ── Density ───────────────────────────────────────────────────────────────────

import type { DensityStatusResponse } from '@ridenrest/shared'

export async function triggerDensityAnalysis(adventureId: string, categories: string[]): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/density/analyze', {
    method: 'POST',
    body: JSON.stringify({ adventureId, categories }),
  })
}

export async function getDensityStatus(adventureId: string): Promise<DensityStatusResponse> {
  return apiFetch<DensityStatusResponse>(`/api/density/${adventureId}/status`)
}

export type { DensityStatusResponse }

// ── Weather ───────────────────────────────────────────────────────────────────

import type { WeatherForecast } from '@ridenrest/shared'

export interface GetWeatherParams {
  segmentId: string
  departureTime?: string  // ISO 8601
  speedKmh?: number
  fromKm?: number
  stageDepartures?: string  // JSON-encoded array of {startKm, endKm, departureTime}
}

export async function getWeatherForecast(params: GetWeatherParams): Promise<WeatherForecast> {
  const search = new URLSearchParams({ segmentId: params.segmentId })
  if (params.departureTime) search.set('departureTime', params.departureTime)
  if (params.speedKmh != null) search.set('speedKmh', String(params.speedKmh))
  if (params.fromKm != null) search.set('fromKm', String(params.fromKm))
  if (params.stageDepartures) search.set('stageDepartures', params.stageDepartures)
  return apiFetch<WeatherForecast>(`/api/weather?${search}`)
}

export type { WeatherForecast }

// ── Stage Weather ─────────────────────────────────────────────────────────────

import type { StageWeatherPoint } from '@ridenrest/shared'

export interface GetStageWeatherParams {
  stageId: string
  departureTime?: string
  speedKmh?: number
}

export async function getStageWeather(params: GetStageWeatherParams): Promise<StageWeatherPoint | null> {
  const search = new URLSearchParams()
  if (params.departureTime) search.set('departureTime', params.departureTime)
  if (params.speedKmh != null) search.set('speedKmh', String(params.speedKmh))
  const qs = search.toString()
  return apiFetch<StageWeatherPoint | null>(`/api/stages/${params.stageId}/weather${qs ? `?${qs}` : ''}`)
}

export type { StageWeatherPoint }

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


// ── Geo ───────────────────────────────────────────────────────────────────────

export async function getReverseCity(lat: number, lng: number): Promise<{ city: string | null; postcode: string | null; state: string | null; country: string | null }> {
  return apiFetch<{ city: string | null; postcode: string | null; state: string | null; country: string | null }>(`/api/geo/reverse-city?lat=${lat}&lng=${lng}`)
}

export async function getReverseAddress(lat: number, lng: number): Promise<{ address: string | null }> {
  return apiFetch<{ address: string | null }>(`/api/geo/reverse-address?lat=${lat}&lng=${lng}`)
}

// ── Feedbacks ─────────────────────────────────────────────────────────────────

export async function submitFeedback(data: {
  category: string
  screen?: string
  description: string
}): Promise<void> {
  await apiFetch('/api/feedbacks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
