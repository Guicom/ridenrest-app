import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
  },
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

describe('instrumentation-client (init PostHog)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    localStorageMock.clear()
  })

  it('initialise PostHog en opt-out par défaut, proxy /phrelay et cloud EU', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key')
    const posthog = (await import('posthog-js')).default
    await import('./instrumentation-client')

    expect(posthog.init).toHaveBeenCalledOnce()
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({
        api_host: '/phrelay',
        ui_host: 'https://eu.posthog.com',
        opt_out_capturing_by_default: true,
        capture_pageview: true,
        // Session replay : jamais auto — démarré explicitement si consentement (posthog-3)
        disable_session_recording: true,
        // Masquage global des inputs dans les replays (RGPD, posthog-3)
        session_recording: expect.objectContaining({ maskAllInputs: true }),
      })
    )
  })

  it('ne démarre PAS le replay sans choix de consentement persisté', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key')
    const posthog = (await import('posthog-js')).default
    await import('./instrumentation-client')

    expect(posthog.startSessionRecording).not.toHaveBeenCalled()
  })

  it('ne démarre PAS le replay si consentement refusé', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key')
    localStorageMock.setItem('rnr_analytics_consent', 'denied')
    const posthog = (await import('posthog-js')).default
    await import('./instrumentation-client')

    expect(posthog.startSessionRecording).not.toHaveBeenCalled()
  })

  it('démarre le replay au boot si consentement déjà accordé', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key')
    localStorageMock.setItem('rnr_analytics_consent', 'granted')
    const posthog = (await import('posthog-js')).default
    await import('./instrumentation-client')

    expect(posthog.startSessionRecording).toHaveBeenCalledOnce()
  })

  it('ne fait rien si NEXT_PUBLIC_POSTHOG_KEY est absente', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    const posthog = (await import('posthog-js')).default
    await import('./instrumentation-client')

    expect(posthog.init).not.toHaveBeenCalled()
    expect(posthog.startSessionRecording).not.toHaveBeenCalled()
  })
})
