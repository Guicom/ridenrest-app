import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AdventureCard } from './adventure-card'
import type { AdventureResponse } from '@ridenrest/shared'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

const makeAdventure = (overrides: Partial<AdventureResponse> = {}): AdventureResponse => ({
  id: 'adv-1',
  userId: 'user-1',
  name: 'Transcantabrique',
  totalDistanceKm: 850.5,
  startDate: null,
  endDate: null,
  status: 'planning',
  densityStatus: 'idle',
  densityProgress: 0,
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  ...overrides,
})

describe('AdventureCard — D+ display', () => {
  it('shows elevation gain when totalElevationGainM = 4200', () => {
    render(
      <AdventureCard
        adventure={makeAdventure({ totalElevationGainM: 4200 })}
        isSelected={false}
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.getByText(/↑.*4.*200.*m/)).toBeInTheDocument()
  })

  it('does not show elevation arrow when totalElevationGainM is null', () => {
    render(
      <AdventureCard
        adventure={makeAdventure({ totalElevationGainM: null })}
        isSelected={false}
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.queryByText(/↑/)).toBeNull()
  })

  it('does not show elevation arrow when totalElevationGainM is 0', () => {
    render(
      <AdventureCard
        adventure={makeAdventure({ totalElevationGainM: 0 })}
        isSelected={false}
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.queryByText(/↑/)).toBeNull()
  })

  it('shows startDate formatted in fr-FR when startDate is set', () => {
    render(
      <AdventureCard
        adventure={makeAdventure({ startDate: '2026-06-15' })}
        isSelected={false}
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )
    // French locale formats 2026-06-15 as "15/06/2026"
    expect(screen.getByText('15/06/2026')).toBeInTheDocument()
  })

  it('falls back to createdAt when startDate is null', () => {
    render(
      <AdventureCard
        adventure={makeAdventure({ startDate: null, createdAt: '2026-03-15T00:00:00.000Z' })}
        isSelected={false}
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.getByText('15/03/2026')).toBeInTheDocument()
  })

  it('shows date range when both startDate and endDate are set', () => {
    render(
      <AdventureCard
        adventure={makeAdventure({ startDate: '2026-06-01', endDate: '2026-06-15' })}
        isSelected={false}
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.getByText('01/06/2026 → 15/06/2026')).toBeInTheDocument()
  })

  it('shows only startDate when endDate is null', () => {
    render(
      <AdventureCard
        adventure={makeAdventure({ startDate: '2026-06-01', endDate: null })}
        isSelected={false}
        onSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.getByText('01/06/2026')).toBeInTheDocument()
    expect(screen.queryByText(/→/)).toBeNull()
  })
})
