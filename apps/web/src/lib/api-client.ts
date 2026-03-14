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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // Don't set Content-Type for FormData — browser sets it with the multipart boundary
  const isFormData = options?.body instanceof FormData
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
    credentials: 'include', // Send cookies (Better Auth session)
  })

  if (!res.ok) {
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
