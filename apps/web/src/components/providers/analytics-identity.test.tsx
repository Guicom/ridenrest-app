import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import posthog from 'posthog-js'
import { AnalyticsIdentity } from './analytics-identity'
import { CONSENT_STORAGE_KEY, CONSENT_CHANGE_EVENT } from '@/lib/analytics-consent'

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}))

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
}))

vi.mock('@/lib/auth/client', () => ({
  useSession: mockUseSession,
}))

// localStorage mock (pattern projet — jsdom n'en fournit pas ici)
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

describe('AnalyticsIdentity', () => {
  beforeEach(() => {
    cleanup()
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('identifie l’utilisateur quand session + consentement accordé', () => {
    localStorageMock.setItem(CONSENT_STORAGE_KEY, 'granted')
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-123' } } })

    render(<AnalyticsIdentity />)

    expect(posthog.identify).toHaveBeenCalledWith('user-123')
  })

  it('n’identifie JAMAIS sans consentement (aucun choix)', () => {
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-123' } } })

    render(<AnalyticsIdentity />)

    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('n’identifie JAMAIS en opt-out (denied)', () => {
    localStorageMock.setItem(CONSENT_STORAGE_KEY, 'denied')
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-123' } } })

    render(<AnalyticsIdentity />)

    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('n’identifie pas sans session authentifiée', () => {
    localStorageMock.setItem(CONSENT_STORAGE_KEY, 'granted')
    mockUseSession.mockReturnValue({ data: null })

    render(<AnalyticsIdentity />)

    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('réagit à un opt-in tardif (event de changement de consentement)', () => {
    mockUseSession.mockReturnValue({ data: { user: { id: 'user-123' } } })
    render(<AnalyticsIdentity />)
    expect(posthog.identify).not.toHaveBeenCalled()

    act(() => {
      localStorageMock.setItem(CONSENT_STORAGE_KEY, 'granted')
      window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: 'granted' }))
    })

    expect(posthog.identify).toHaveBeenCalledWith('user-123')
  })

  it('ne rend rien dans le DOM', () => {
    mockUseSession.mockReturnValue({ data: null })
    const { container } = render(<AnalyticsIdentity />)
    expect(container).toBeEmptyDOMElement()
  })
})
