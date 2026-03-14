const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3010'
const AUTH_URL = process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3011'

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

// In-memory token cache — avoids an extra HTTP round-trip on every API call
let tokenCache: { value: string; expiresAt: number } | null = null

export function invalidateAuthTokenCache(): void {
  tokenCache = null
}

// Fetch JWT access token from Better Auth /api/auth/token endpoint (jwt plugin)
// Cached for 13 minutes (token valid 15min, 2min safety buffer)
async function getAuthToken(): Promise<string | null> {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now) {
    return tokenCache.value
  }
  try {
    const res = await fetch(`${AUTH_URL}/api/auth/token`, {
      credentials: 'include', // Send session cookie to get JWT
    })
    if (!res.ok) {
      tokenCache = null
      return null
    }
    const data = (await res.json()) as { token?: string }
    const token = data?.token ?? null
    if (token) {
      tokenCache = { value: token, expiresAt: now + 13 * 60 * 1000 }
    }
    return token
  } catch {
    tokenCache = null
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
      // Clear cached token — it's expired; Next.js middleware will redirect to /login
      tokenCache = null
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
