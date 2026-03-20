import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as tanstackQuery from '@tanstack/react-query'
import { AdventureList } from './adventure-list'
import type { AdventureResponse } from '@ridenrest/shared'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: vi.fn(), useMutation: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

const makeAdventure = (overrides: Partial<AdventureResponse> = {}): AdventureResponse => ({
  id: 'adv-1',
  userId: 'user-1',
  name: 'Transcantabrique',
  totalDistanceKm: 850.5,
  status: 'planning',
  densityStatus: 'idle',
  densityProgress: 0,
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  ...overrides,
})

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AdventureList />
    </QueryClientProvider>,
  )
  return qc
}

describe('AdventureList', () => {
  beforeEach(() => {
    vi.mocked(tanstackQuery.useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof tanstackQuery.useMutation>)
  })

  it('renders skeleton while isPending', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [],
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders error state when query fails', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [],
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    expect(screen.getByText('Impossible de charger les aventures.')).toBeInTheDocument()
  })

  it('renders empty state with bicycle icon when adventures is []', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    expect(screen.getByText('Aucune aventure')).toBeInTheDocument()
    expect(screen.getByText('Créez votre première aventure pour commencer.')).toBeInTheDocument()
    // Bike icon (SVG) rendered by lucide-react
    const svgs = document.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('renders adventure cards with name and distance', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [
        makeAdventure({ id: 'adv-1', name: 'Transcantabrique', totalDistanceKm: 850.5 }),
        makeAdventure({ id: 'adv-2', name: 'Route des Grandes Alpes', totalDistanceKm: 720.0 }),
      ],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    expect(screen.getByText('Transcantabrique')).toBeInTheDocument()
    expect(screen.getByText('850.5 km')).toBeInTheDocument()
    expect(screen.getByText('Route des Grandes Alpes')).toBeInTheDocument()
    expect(screen.getByText('720.0 km')).toBeInTheDocument()
  })

  it('desktop action buttons are always visible (no selection required)', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [makeAdventure({ id: 'adv-1' })],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    // Desktop buttons always in DOM (CSS-hidden on mobile but present)
    expect(screen.getByText('Planning')).toBeInTheDocument()
    expect(screen.getByText('Modifier')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    // Mobile action row NOT visible until card is tapped
    expect(screen.queryByText('Démarrer en Live')).not.toBeInTheDocument()
  })

  it('tapping a card on mobile reveals the mobile action row', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [makeAdventure({ id: 'adv-1' })],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    expect(screen.queryByText('Démarrer en Live')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Transcantabrique'))

    expect(screen.getByText('Démarrer en Live')).toBeInTheDocument()
    // Now 2 Planning buttons (desktop + mobile)
    expect(screen.getAllByText('Planning')).toHaveLength(2)
    expect(screen.getAllByText('Modifier')).toHaveLength(2)
  })

  it('Live button (desktop) navigates to /live/:id', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [makeAdventure({ id: 'adv-1' })],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    fireEvent.click(screen.getByText('Live'))
    expect(mockPush).toHaveBeenCalledWith('/live/adv-1')
  })

  it('Planning button (desktop) navigates to /map/:id?mode=planning', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [makeAdventure({ id: 'adv-1' })],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    fireEvent.click(screen.getByText('Planning'))
    expect(mockPush).toHaveBeenCalledWith('/map/adv-1?mode=planning')
  })

  it('Modifier button (desktop) navigates to /adventures/:id', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [makeAdventure({ id: 'adv-1' })],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    fireEvent.click(screen.getByText('Modifier'))
    expect(mockPush).toHaveBeenCalledWith('/adventures/adv-1')
  })

  it('Démarrer en Live button (mobile) navigates to /live/:id after card selection', () => {
    vi.mocked(tanstackQuery.useQuery).mockReturnValue({
      data: [makeAdventure({ id: 'adv-1' })],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof tanstackQuery.useQuery>)

    renderList()

    // Select the card first to reveal mobile action row
    fireEvent.click(screen.getByText('Transcantabrique'))
    fireEvent.click(screen.getByText('Démarrer en Live'))
    expect(mockPush).toHaveBeenCalledWith('/live/adv-1')
  })
})
