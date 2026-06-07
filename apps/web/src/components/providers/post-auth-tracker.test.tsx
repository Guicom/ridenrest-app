import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PostAuthTracker } from './post-auth-tracker'
import { trackSignupStarted, trackSignupCompleted, trackLoginCompleted } from '@ridenrest/analytics'
import { AUTH_FLOW_MARKER_KEY } from '@/components/shared/google-sign-in-button'

vi.mock('@ridenrest/analytics', () => ({
  trackSignupStarted: vi.fn(),
  trackSignupCompleted: vi.fn(),
  trackLoginCompleted: vi.fn(),
}))

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
}))

vi.mock('@/lib/auth/client', () => ({
  useSession: mockUseSession,
}))

// sessionStorage mock (pattern projet — jsdom n'en fournit pas ici)
const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true })

describe('PostAuthTracker (résolution post-OAuth google)', () => {
  beforeEach(() => {
    cleanup()
    sessionStorageMock.clear()
    vi.clearAllMocks()
  })

  it('compte créé à l’instant + marqueur google (chemin login) → backfill signup_started puis signup_completed', () => {
    sessionStorageMock.setItem(AUTH_FLOW_MARKER_KEY, 'google')
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', createdAt: new Date().toISOString() } },
    })

    render(<PostAuthTracker />)

    expect(trackSignupStarted).toHaveBeenCalledWith({ method: 'google' })
    expect(trackSignupCompleted).toHaveBeenCalledWith({ method: 'google' })
    // Ordre du funnel : started AVANT completed
    expect(vi.mocked(trackSignupStarted).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(trackSignupCompleted).mock.invocationCallOrder[0],
    )
    expect(trackLoginCompleted).not.toHaveBeenCalled()
  })

  it('compte créé à l’instant + marqueur google-register → signup_completed SANS backfill (started déjà émis au clic)', () => {
    sessionStorageMock.setItem(AUTH_FLOW_MARKER_KEY, 'google-register')
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', createdAt: new Date().toISOString() } },
    })

    render(<PostAuthTracker />)

    expect(trackSignupStarted).not.toHaveBeenCalled()
    expect(trackSignupCompleted).toHaveBeenCalledWith({ method: 'google' })
    expect(trackLoginCompleted).not.toHaveBeenCalled()
  })

  it('compte ancien + marqueur google → login_completed (aucun backfill)', () => {
    sessionStorageMock.setItem(AUTH_FLOW_MARKER_KEY, 'google')
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() } },
    })

    render(<PostAuthTracker />)

    expect(trackLoginCompleted).toHaveBeenCalledWith({ method: 'google' })
    expect(trackSignupStarted).not.toHaveBeenCalled()
    expect(trackSignupCompleted).not.toHaveBeenCalled()
  })

  it('compte ancien + marqueur google-register → login_completed (utilisateur existant passé par /register)', () => {
    sessionStorageMock.setItem(AUTH_FLOW_MARKER_KEY, 'google-register')
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() } },
    })

    render(<PostAuthTracker />)

    expect(trackLoginCompleted).toHaveBeenCalledWith({ method: 'google' })
    expect(trackSignupStarted).not.toHaveBeenCalled()
    expect(trackSignupCompleted).not.toHaveBeenCalled()
  })

  it('consomme le marqueur — émission unique par retour OAuth', () => {
    sessionStorageMock.setItem(AUTH_FLOW_MARKER_KEY, 'google')
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', createdAt: new Date().toISOString() } },
    })

    render(<PostAuthTracker />)
    expect(sessionStorageMock.getItem(AUTH_FLOW_MARKER_KEY)).toBeNull()

    cleanup()
    render(<PostAuthTracker />) // re-montage (navigation) — plus de marqueur
    expect(trackSignupCompleted).toHaveBeenCalledTimes(1)
  })

  it('sans marqueur → aucun event (flows email gérés par les formulaires)', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', createdAt: new Date().toISOString() } },
    })

    render(<PostAuthTracker />)

    expect(trackSignupCompleted).not.toHaveBeenCalled()
    expect(trackLoginCompleted).not.toHaveBeenCalled()
  })

  it('sans session → rien, et le marqueur est conservé pour le retour', () => {
    sessionStorageMock.setItem(AUTH_FLOW_MARKER_KEY, 'google')
    mockUseSession.mockReturnValue({ data: null })

    render(<PostAuthTracker />)

    expect(trackSignupCompleted).not.toHaveBeenCalled()
    expect(trackLoginCompleted).not.toHaveBeenCalled()
    expect(sessionStorageMock.getItem(AUTH_FLOW_MARKER_KEY)).toBe('google')
  })

  it('createdAt absent → login_completed par défaut (classification prudente)', () => {
    sessionStorageMock.setItem(AUTH_FLOW_MARKER_KEY, 'google')
    mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } } })

    render(<PostAuthTracker />)

    expect(trackLoginCompleted).toHaveBeenCalledWith({ method: 'google' })
    expect(trackSignupCompleted).not.toHaveBeenCalled()
  })
})
