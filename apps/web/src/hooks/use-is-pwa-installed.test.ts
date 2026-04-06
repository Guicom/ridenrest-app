import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useIsPwaInstalled } from './use-is-pwa-installed'

describe('useIsPwaInstalled', () => {
  const originalMatchMedia = window.matchMedia
  const originalNavigator = Object.getOwnPropertyDescriptor(window, 'navigator')

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    if (originalNavigator) {
      Object.defineProperty(window, 'navigator', originalNavigator)
    }
  })

  it('returns false when not in standalone mode', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    Object.defineProperty(window.navigator, 'standalone', {
      value: undefined,
      configurable: true,
    })

    const { result } = renderHook(() => useIsPwaInstalled())
    expect(result.current).toBe(false)
  })

  it('returns true when matchMedia standalone matches (Chrome/Firefox/Edge)', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })

    const { result } = renderHook(() => useIsPwaInstalled())
    expect(result.current).toBe(true)
  })

  it('returns true when navigator.standalone is true (iOS Safari)', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      configurable: true,
    })

    const { result } = renderHook(() => useIsPwaInstalled())
    expect(result.current).toBe(true)
  })

  it('returns false when neither standalone detection matches', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    Object.defineProperty(window.navigator, 'standalone', {
      value: false,
      configurable: true,
    })

    const { result } = renderHook(() => useIsPwaInstalled())
    expect(result.current).toBe(false)
  })
})
