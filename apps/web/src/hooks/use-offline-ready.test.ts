import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOfflineGate } from './use-offline-ready'

describe('useOfflineGate', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
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

  it('returns isOnline true and null disabledReason when online', () => {
    const { result } = renderHook(() => useOfflineGate())
    expect(result.current.isOnline).toBe(true)
    expect(result.current.disabledReason).toBeNull()
  })

  it('returns isOnline false and disabled reason when offline', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, onLine: false },
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useOfflineGate())
    expect(result.current.isOnline).toBe(false)
    expect(result.current.disabledReason).toBe(
      'Fonctionnalité disponible en ligne',
    )
  })

  it('updates reactively when going offline then online', () => {
    const { result } = renderHook(() => useOfflineGate())
    expect(result.current.isOnline).toBe(true)
    expect(result.current.disabledReason).toBeNull()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.isOnline).toBe(false)
    expect(result.current.disabledReason).toBe(
      'Fonctionnalité disponible en ligne',
    )

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current.isOnline).toBe(true)
    expect(result.current.disabledReason).toBeNull()
  })
})
