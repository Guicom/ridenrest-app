import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useReconnectionHandler } from './use-reconnection-handler'

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    queryClient,
  }
}

describe('useReconnectionHandler', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, onLine: true },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
  })

  it('shows toast and refetches queries on offline→online transition', async () => {
    const { toast } = await import('sonner')
    const { wrapper, queryClient } = createWrapper()
    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue()

    renderHook(() => useReconnectionHandler(), { wrapper })

    // Go offline
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    // Go back online
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(toast.success).toHaveBeenCalledWith('Connexion rétablie', {
      duration: 3000,
    })
    expect(refetchSpy).toHaveBeenCalledWith({ type: 'active' })
  })

  it('does NOT show toast on initial mount when already online', async () => {
    const { toast } = await import('sonner')
    const { wrapper } = createWrapper()

    renderHook(() => useReconnectionHandler(), { wrapper })

    expect(toast.success).not.toHaveBeenCalled()
  })
})
