import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNetworkStatus } from './use-network-status'

describe('useNetworkStatus', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    // Default: online
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

  it('returns isOnline = true when navigator.onLine is true', () => {
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOnline).toBe(true)
  })

  it('returns isOnline = false when navigator.onLine is false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, onLine: false },
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOnline).toBe(false)
  })

  it('updates isOnline to false when offline event fires', () => {
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOnline).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.isOnline).toBe(false)
  })

  it('updates isOnline to true when online event fires', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, onLine: false },
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOnline).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current.isOnline).toBe(true)
  })

  it('removes event listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useNetworkStatus())

    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('offline', expect.any(Function))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
