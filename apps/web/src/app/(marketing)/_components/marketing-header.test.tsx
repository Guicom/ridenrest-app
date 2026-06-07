import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MarketingHeader } from './marketing-header'
import { trackLandingCtaClicked } from '@ridenrest/analytics'

// ── Auth mock ─────────────────────────────────────────────────────────────────

const useSessionMock = vi.fn()

vi.mock('@/lib/auth/client', () => ({
  useSession: (...args: unknown[]) => useSessionMock(...args),
}))

vi.mock('@ridenrest/analytics', () => ({
  trackLandingCtaClicked: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockUnauthenticated() {
  useSessionMock.mockReturnValue({ data: null, isPending: false })
}

function mockAuthenticated() {
  useSessionMock.mockReturnValue({
    data: { user: { id: 'u1', email: 'test@example.com' } },
    isPending: false,
  })
}

function mockPending() {
  useSessionMock.mockReturnValue({ data: null, isPending: true })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MarketingHeader', () => {
  describe('16.22 — AC #1: unauthenticated shows "Se connecter"', () => {
    it('shows "Se connecter" when user is not authenticated', () => {
      mockUnauthenticated()
      render(<MarketingHeader />)

      const links = screen.getAllByRole('link', { name: /se connecter/i })
      expect(links).toHaveLength(2) // desktop + mobile CTA
      links.forEach((link) => expect(link).toHaveAttribute('href', '/adventures'))
    })
  })

  describe('16.22 — AC #2: authenticated shows "Mes aventures"', () => {
    it('shows "Mes aventures" when user is authenticated', () => {
      mockAuthenticated()
      render(<MarketingHeader />)

      const links = screen.getAllByRole('link', { name: /mes aventures/i })
      expect(links).toHaveLength(2) // desktop + mobile CTA
      links.forEach((link) => expect(link).toHaveAttribute('href', '/adventures'))
    })

    it('does not show "Se connecter" when authenticated', () => {
      mockAuthenticated()
      render(<MarketingHeader />)

      expect(screen.queryByRole('link', { name: /se connecter/i })).not.toBeInTheDocument()
    })
  })

  describe('funnel acquisition — landing_cta_clicked (posthog)', () => {
    it('émet landing_cta_clicked (header, non authentifié) au clic sur le CTA', () => {
      mockUnauthenticated()
      render(<MarketingHeader />)

      fireEvent.click(screen.getAllByRole('link', { name: /se connecter/i })[0])

      expect(trackLandingCtaClicked).toHaveBeenCalledWith({
        placement: 'header',
        authenticated: false,
      })
    })

    it('émet landing_cta_clicked avec authenticated=true pour « Mes aventures »', () => {
      mockAuthenticated()
      render(<MarketingHeader />)

      fireEvent.click(screen.getAllByRole('link', { name: /mes aventures/i })[1]) // CTA mobile

      expect(trackLandingCtaClicked).toHaveBeenCalledWith({
        placement: 'header',
        authenticated: true,
      })
    })
  })

  describe('16.22 — AC #3: loading state shows skeleton', () => {
    it('shows skeleton placeholder when session is loading', () => {
      mockPending()
      render(<MarketingHeader />)

      const skeletons = screen.getAllByTestId('cta-skeleton')
      expect(skeletons).toHaveLength(2) // desktop + mobile skeleton
    })

    it('does not show "Se connecter" or "Mes aventures" while loading', () => {
      mockPending()
      render(<MarketingHeader />)

      expect(screen.queryByRole('link', { name: /se connecter/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /mes aventures/i })).not.toBeInTheDocument()
    })
  })
})
