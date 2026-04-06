import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MarketingHeader } from './marketing-header'

// ── Auth mock ─────────────────────────────────────────────────────────────────

const useSessionMock = vi.fn()

vi.mock('@/lib/auth/client', () => ({
  useSession: (...args: unknown[]) => useSessionMock(...args),
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
