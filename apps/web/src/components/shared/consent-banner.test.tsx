import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import posthog from 'posthog-js'
import { ConsentBanner } from './consent-banner'
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

describe('ConsentBanner', () => {
  beforeEach(() => {
    cleanup()
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('affiche la bannière quand aucun choix n’est persisté', () => {
    render(<ConsentBanner />)
    expect(screen.getByRole('dialog', { name: /consentement/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accepter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument()
  })

  it('contient un lien vers les mentions légales', () => {
    render(<ConsentBanner />)
    expect(screen.getByRole('link', { name: /en savoir plus/i })).toHaveAttribute(
      'href',
      '/mentions-legales'
    )
  })

  it('n’affiche pas la bannière si un choix granted est persisté', () => {
    localStorageMock.setItem(CONSENT_STORAGE_KEY, 'granted')
    render(<ConsentBanner />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('n’affiche pas la bannière si un choix denied est persisté', () => {
    localStorageMock.setItem(CONSENT_STORAGE_KEY, 'denied')
    render(<ConsentBanner />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Accepter → opt_in_capturing + persistance granted + bannière masquée', async () => {
    const user = userEvent.setup()
    render(<ConsentBanner />)
    await user.click(screen.getByRole('button', { name: 'Accepter' }))

    expect(posthog.opt_in_capturing).toHaveBeenCalledOnce()
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled()
    expect(localStorageMock.getItem(CONSENT_STORAGE_KEY)).toBe('granted')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Refuser → opt_out_capturing + persistance denied + bannière masquée', async () => {
    const user = userEvent.setup()
    render(<ConsentBanner />)
    await user.click(screen.getByRole('button', { name: 'Refuser' }))

    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce()
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled()
    expect(localStorageMock.getItem(CONSENT_STORAGE_KEY)).toBe('denied')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('est utilisable au clavier (boutons focusables, activation Entrée)', async () => {
    const user = userEvent.setup()
    render(<ConsentBanner />)

    await user.tab() // lien mentions légales
    await user.tab() // Refuser
    expect(screen.getByRole('button', { name: 'Refuser' })).toHaveFocus()
    await user.tab() // Accepter
    expect(screen.getByRole('button', { name: 'Accepter' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(posthog.opt_in_capturing).toHaveBeenCalledOnce()
    expect(localStorageMock.getItem(CONSENT_STORAGE_KEY)).toBe('granted')
  })
})
