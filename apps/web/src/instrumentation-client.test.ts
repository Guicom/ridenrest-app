import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('posthog-js', () => ({
  default: { init: vi.fn() },
}))

describe('instrumentation-client (init PostHog)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
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
        // Session replay : posthog-3 uniquement (masquage carte requis avant activation)
        disable_session_recording: true,
      })
    )
  })

  it('ne fait rien si NEXT_PUBLIC_POSTHOG_KEY est absente', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    const posthog = (await import('posthog-js')).default
    await import('./instrumentation-client')

    expect(posthog.init).not.toHaveBeenCalled()
  })
})
