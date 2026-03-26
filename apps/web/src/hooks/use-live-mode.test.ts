import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLiveMode } from './use-live-mode'
import { useLiveStore } from '@/stores/live.store'

const CONSENT_KEY = 'ridenrest:geoloc-consent'

// Mock navigator.geolocation
const mockWatchPosition = vi.fn()
const mockClearWatch = vi.fn()

Object.defineProperty(globalThis.navigator, 'geolocation', {
  value: {
    watchPosition: mockWatchPosition,
    clearWatch: mockClearWatch,
  },
  writable: true,
})

// localStorage mock (jsdom may not provide full Storage API)
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

describe('useLiveMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    useLiveStore.setState({
      isLiveModeActive: false,
      geolocationConsented: false,
      currentPosition: null,
      currentKmOnRoute: null,
    })
    mockWatchPosition.mockReturnValue(42) // watchId
  })

  it('initializes hasConsented from localStorage', () => {
    localStorageMock.setItem(CONSENT_KEY, 'true')
    const { result } = renderHook(() => useLiveMode())
    expect(result.current.hasConsented).toBe(true)
  })

  it('hasConsented is false when no localStorage key', () => {
    const { result } = renderHook(() => useLiveMode())
    expect(result.current.hasConsented).toBe(false)
  })

  it('grantConsent writes to localStorage, syncs store, and starts watching', () => {
    const { result } = renderHook(() => useLiveMode())
    act(() => { result.current.grantConsent() })
    expect(localStorageMock.getItem(CONSENT_KEY)).toBe('true')
    expect(result.current.hasConsented).toBe(true)
    expect(useLiveStore.getState().geolocationConsented).toBe(true)
    expect(mockWatchPosition).toHaveBeenCalledTimes(1)
  })

  it('startWatching calls watchPosition with enableHighAccuracy', () => {
    const { result } = renderHook(() => useLiveMode())
    act(() => { result.current.startWatching() })
    expect(mockWatchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: true, timeout: 10000 }),
    )
  })

  it('stopWatching calls clearWatch and deactivates live mode', () => {
    const { result } = renderHook(() => useLiveMode())
    act(() => { result.current.startWatching() })
    act(() => { result.current.stopWatching() })
    expect(mockClearWatch).toHaveBeenCalledWith(42)
    expect(useLiveStore.getState().isLiveModeActive).toBe(false)
  })

  it('on position success: updates GPS position and activates live mode', () => {
    const { result } = renderHook(() => useLiveMode())
    act(() => { result.current.startWatching() })

    const successCallback = mockWatchPosition.mock.calls[0][0]
    act(() => {
      successCallback({
        coords: { latitude: 43.2965, longitude: 5.3698 },
      })
    })

    const state = useLiveStore.getState()
    expect(state.currentPosition).toEqual({ lat: 43.2965, lng: 5.3698 })
    expect(state.isLiveModeActive).toBe(true)
  })

  it('on PERMISSION_DENIED: sets permissionDenied true', () => {
    const { result } = renderHook(() => useLiveMode())
    act(() => { result.current.startWatching() })

    const errorCallback = mockWatchPosition.mock.calls[0][1]
    act(() => {
      errorCallback({ code: 1, PERMISSION_DENIED: 1 })
    })

    expect(result.current.permissionDenied).toBe(true)
  })

  it('unmount triggers clearWatch cleanup', () => {
    const { result, unmount } = renderHook(() => useLiveMode())
    act(() => { result.current.startWatching() })
    unmount()
    expect(mockClearWatch).toHaveBeenCalledWith(42)
  })

  it('returns expected interface', () => {
    const { result } = renderHook(() => useLiveMode())
    expect(result.current).toHaveProperty('isLiveModeActive')
    expect(result.current).toHaveProperty('hasConsented')
    expect(result.current).toHaveProperty('permissionDenied')
    expect(result.current).toHaveProperty('startWatching')
    expect(result.current).toHaveProperty('stopWatching')
    expect(result.current).toHaveProperty('grantConsent')
  })
})
