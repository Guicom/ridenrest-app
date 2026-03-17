import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiClient from '@/lib/api-client'
import { DensityTriggerButton } from './density-trigger-button'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

vi.mock('@/lib/api-client')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function makeDoneSegment(overrides: Partial<AdventureSegmentResponse> = {}): AdventureSegmentResponse {
  return {
    id: 'seg-1',
    adventureId: 'adv-1',
    name: 'Segment Test',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 45.2,
    elevationGainM: null,
    parseStatus: 'done',
    source: null,
    boundingBox: null,
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  }
}

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(apiClient.getDensityStatus).mockResolvedValue({ densityStatus: 'idle', densityProgress: 0, coverageGaps: [] })
})

describe('DensityTriggerButton', () => {
  it('shows "Analyser la densité" when idle and all segments done', async () => {
    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )
    expect(screen.getByRole('button', { name: /analyser la densité/i })).toBeInTheDocument()
  })

  it('shows "Analyse en cours… 0%" and is disabled when densityStatus is pending', async () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({ densityStatus: 'pending', densityProgress: 0, coverageGaps: [] })

    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /analyse en cours… 0%/i })).toBeDisabled()
    })
  })

  it('shows progress percentage when densityStatus is processing', async () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({ densityStatus: 'processing', densityProgress: 42, coverageGaps: [] })

    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /analyse en cours… 42%/i })).toBeDisabled()
    })
  })

  it('is disabled when not all segments are parsed', () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({ densityStatus: 'idle', densityProgress: 0, coverageGaps: [] })

    renderWithQuery(
      <DensityTriggerButton
        adventureId="adv-1"
        segments={[makeDoneSegment(), makeDoneSegment({ id: 'seg-2', parseStatus: 'pending' })]}
      />,
    )

    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when segments list is empty', () => {
    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[]} />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
