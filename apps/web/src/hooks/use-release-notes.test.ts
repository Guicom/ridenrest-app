import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReleaseNotes } from './use-release-notes'

const STORAGE_KEY = 'ridenrest:last-seen-version'
const APP_VERSION = '1.0.0'

vi.stubEnv('NEXT_PUBLIC_APP_VERSION', APP_VERSION)

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

describe('useReleaseNotes', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('first visit — does not show popup, initializes localStorage', () => {
    const { result } = renderHook(() => useReleaseNotes())

    expect(result.current.showReleaseNotes).toBe(false)
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe(APP_VERSION)
  })

  it('first visit on version > 1.0.0 — shows release notes', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.1.0')
    const { result } = renderHook(() => useReleaseNotes())

    expect(result.current.showReleaseNotes).toBe(true)
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', APP_VERSION)
  })

  it('different version — shows release notes', () => {
    localStorageMock.setItem(STORAGE_KEY, '0.9.0')

    const { result } = renderHook(() => useReleaseNotes())

    expect(result.current.showReleaseNotes).toBe(true)
  })

  it('same version — does not show release notes', () => {
    localStorageMock.setItem(STORAGE_KEY, APP_VERSION)

    const { result } = renderHook(() => useReleaseNotes())

    expect(result.current.showReleaseNotes).toBe(false)
  })

  it('dismissReleaseNotes updates localStorage and hides popup', () => {
    localStorageMock.setItem(STORAGE_KEY, '0.9.0')

    const { result } = renderHook(() => useReleaseNotes())

    expect(result.current.showReleaseNotes).toBe(true)

    act(() => {
      result.current.dismissReleaseNotes()
    })

    expect(result.current.showReleaseNotes).toBe(false)
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe(APP_VERSION)
  })
})
