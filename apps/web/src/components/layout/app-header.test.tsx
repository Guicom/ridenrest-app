import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as tanstackQuery from '@tanstack/react-query'
import { AppHeader } from './app-header'
import type { AdventureResponse } from '@ridenrest/shared'

// ── Navigation mocks ──────────────────────────────────────────────────────────

const mockPush = vi.fn()
let mockPathname = '/adventures'
let mockParams: Record<string, string> = {}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
  useParams: () => mockParams,
}))

// ── TanStack Query mock ───────────────────────────────────────────────────────

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: vi.fn() }
})

// ── API client mock ───────────────────────────────────────────────────────────

vi.mock('@/lib/api-client', () => ({
  getAdventure: vi.fn(),
  submitFeedback: vi.fn(),
}))

// ── Auth mock ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/client', () => ({
  useSession: vi.fn().mockReturnValue({ data: { user: { email: 'test@example.com' } } }),
}))

// ── FeedbackModal mock ────────────────────────────────────────────────────────

vi.mock('@/components/shared/feedback-modal', () => ({
  FeedbackModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="feedback-modal" /> : null,
}))

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
  mockPathname = '/adventures'
  mockParams = {}
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeAdventure = (overrides: Partial<AdventureResponse> = {}): AdventureResponse => ({
  id: 'adv-1',
  userId: 'user-1',
  name: 'Transcantabrique 2026',
  totalDistanceKm: 850.5,
  status: 'planning',
  densityStatus: 'idle',
  densityProgress: 0,
  avgSpeedKmh: 15,
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  ...overrides,
})

function renderHeader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AppHeader />
    </QueryClientProvider>,
  )
}

function mockQueryIdle() {
  vi.mocked(tanstackQuery.useQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof tanstackQuery.useQuery>)
}

function mockQueryPending() {
  vi.mocked(tanstackQuery.useQuery).mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
  } as unknown as ReturnType<typeof tanstackQuery.useQuery>)
}

function mockQueryResolved(adventure: AdventureResponse) {
  vi.mocked(tanstackQuery.useQuery).mockReturnValue({
    data: adventure,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof tanstackQuery.useQuery>)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AppHeader', () => {
  describe('6.2 — logo with link to /adventures', () => {
    it('renders logo as a link to /adventures', () => {
      mockQueryIdle()
      renderHeader()

      const link = screen.getByRole('link', { name: /ride'n'rest/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/adventures')
    })
  })

  describe('6.3 — shows adventure name on map pages only', () => {
    it('shows adventure name in center when on a map page', () => {
      mockPathname = '/map/adv-1'
      mockParams = { id: 'adv-1' }
      mockQueryResolved(makeAdventure({ name: 'Route des Alpes' }))

      renderHeader()

      expect(screen.getByText('Route des Alpes')).toBeInTheDocument()
    })

    it('shows skeleton while adventure name is loading on map page', () => {
      mockPathname = '/map/adv-1'
      mockParams = { id: 'adv-1' }
      mockQueryPending()

      renderHeader()

      const skeletons = document.querySelectorAll('[data-slot="skeleton"], .animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
      expect(screen.queryByText('Route des Alpes')).not.toBeInTheDocument()
    })

    it('does not show adventure name on adventure detail page', () => {
      mockPathname = '/adventures/adv-1'
      mockParams = { id: 'adv-1' }
      mockQueryIdle()

      renderHeader()

      expect(screen.queryByText('Transcantabrique 2026')).not.toBeInTheDocument()
      const skeletons = document.querySelectorAll('[data-slot="skeleton"], .animate-pulse')
      expect(skeletons.length).toBe(0)
    })
  })

  describe('6.4 — hides adventure name when on /adventures list page', () => {
    it('renders no adventure name on the adventures list page', () => {
      mockPathname = '/adventures'
      mockParams = {}
      mockQueryIdle()

      renderHeader()

      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBe(0)
    })
  })

  describe('6.5 — renders nav links with correct hrefs', () => {
    it('renders "Mes aventures" link to /adventures', () => {
      mockQueryIdle()
      renderHeader()

      const links = screen.getAllByRole('link', { name: 'Mes aventures' })
      expect(links.length).toBeGreaterThan(0)
      links.forEach((link) => expect(link).toHaveAttribute('href', '/adventures'))
    })

    it('renders "Mon compte" link to /settings', () => {
      mockQueryIdle()
      renderHeader()

      const links = screen.getAllByRole('link', { name: 'Mon compte' })
      expect(links.length).toBeGreaterThan(0)
      links.forEach((link) => expect(link).toHaveAttribute('href', '/settings'))
    })
  })

  describe('16.6 — Planning badge on map pages', () => {
    it('renders Planning badge when on a map page and adventure data is loaded', () => {
      mockPathname = '/map/adv-1'
      mockParams = { id: 'adv-1' }
      mockQueryResolved(makeAdventure({ name: 'Transcantabrique 2026' }))

      renderHeader()

      expect(screen.getByText('Planning')).toBeInTheDocument()
      expect(screen.getByText('Transcantabrique 2026')).toBeInTheDocument()
    })

    it('does not render Planning badge while adventure is loading', () => {
      mockPathname = '/map/adv-1'
      mockParams = { id: 'adv-1' }
      mockQueryPending()

      renderHeader()

      expect(screen.queryByText('Planning')).not.toBeInTheDocument()
    })
  })

  describe('16.7 — "Aide" link and "Feedback" button in desktop nav', () => {
    it('renders "Aide" link to /help in desktop nav', () => {
      mockQueryIdle()
      renderHeader()

      const links = screen.getAllByRole('link', { name: 'Aide' })
      expect(links.length).toBeGreaterThan(0)
      const helpLink = links.find((l) => l.getAttribute('href') === '/help')
      expect(helpLink).toBeInTheDocument()
    })

    it('renders "Feedback" button in desktop nav', () => {
      mockQueryIdle()
      renderHeader()

      const feedbackBtn = screen.getAllByRole('button', { name: 'Feedback' })
      expect(feedbackBtn.length).toBeGreaterThan(0)
    })

    it('opens FeedbackModal when "Feedback" button is clicked', async () => {
      const { userEvent } = await import('@testing-library/user-event')
      const ue = userEvent.setup()
      mockQueryIdle()
      renderHeader()

      expect(screen.queryByTestId('feedback-modal')).not.toBeInTheDocument()

      const buttons = screen.getAllByRole('button', { name: 'Feedback' })
      await ue.click(buttons[0])

      expect(screen.getByTestId('feedback-modal')).toBeInTheDocument()
    })
  })

  describe('6.6 — header hidden in live mode', () => {
    it('does not render the header when pathname starts with /live/', () => {
      mockPathname = '/live/adv-1'
      mockParams = { id: 'adv-1' }
      mockQueryIdle()

      renderHeader()

      const header = document.querySelector('header')
      expect(header).not.toBeInTheDocument()
    })

    it('renders the header when pathname is not a live route', () => {
      mockPathname = '/map/adv-1'
      mockParams = { id: 'adv-1' }
      mockQueryIdle()

      renderHeader()

      const header = document.querySelector('header')
      expect(header).toBeInTheDocument()
    })
  })
})
