import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import posthog from 'posthog-js'
import { PrivacyToggle } from './privacy-toggle'
import { CONSENT_STORAGE_KEY } from '@/lib/analytics-consent'

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
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

describe('PrivacyToggle', () => {
  beforeEach(() => {
    cleanup()
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('est désactivé par défaut sans choix persisté', () => {
    render(<PrivacyToggle />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('reflète un consentement granted persisté', () => {
    localStorageMock.setItem(CONSENT_STORAGE_KEY, 'granted')
    render(<PrivacyToggle />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('opt-in immédiat à l’activation', async () => {
    const user = userEvent.setup()
    render(<PrivacyToggle />)
    await user.click(screen.getByRole('switch'))

    expect(posthog.opt_in_capturing).toHaveBeenCalledOnce()
    expect(localStorageMock.getItem(CONSENT_STORAGE_KEY)).toBe('granted')
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('opt-out immédiat à la désactivation', async () => {
    localStorageMock.setItem(CONSENT_STORAGE_KEY, 'granted')
    const user = userEvent.setup()
    render(<PrivacyToggle />)
    await user.click(screen.getByRole('switch'))

    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce()
    expect(localStorageMock.getItem(CONSENT_STORAGE_KEY)).toBe('denied')
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })
})
