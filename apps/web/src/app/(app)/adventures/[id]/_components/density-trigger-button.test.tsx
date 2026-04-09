import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiClient from '@/lib/api-client'
import { DensityTriggerButton } from './density-trigger-button'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

vi.mock('@/lib/api-client')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Mock DensityCategoryDialog to control it in tests
vi.mock('./density-category-dialog', () => ({
  DensityCategoryDialog: ({ open, onConfirm }: {
    open: boolean
    onConfirm: (cats: string[]) => void
    onOpenChange: (open: boolean) => void
    isLoading?: boolean
  }) =>
    open ? (
      <div data-testid="density-dialog">
        <button
          data-testid="confirm-btn"
          onClick={() => onConfirm(['hotel', 'hostel'])}
        >
          Confirm
        </button>
      </div>
    ) : null,
}))

function makeDoneSegment(overrides: Partial<AdventureSegmentResponse> = {}): AdventureSegmentResponse {
  return {
    id: 'seg-1',
    adventureId: 'adv-1',
    name: 'Segment Test',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 45.2,
    elevationGainM: null,
    elevationLossM: null,
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
  vi.mocked(apiClient.getDensityStatus).mockResolvedValue({
    densityStatus: 'idle',
    densityProgress: 0,
    coverageGaps: [],
    densityCategories: [],
    densityStale: false,
  })
})

describe('DensityTriggerButton', () => {
  it('shows "Calculer la densité" when idle and all segments done', async () => {
    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )
    expect(screen.getByRole('button', { name: /calculer la densité/i })).toBeInTheDocument()
  })

  it('shows "Densité analysée" when densityStatus is success', async () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({
      densityStatus: 'success',
      densityProgress: 100,
      coverageGaps: [],
      densityCategories: ['hotel'],
      densityStale: false,
    })

    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /densité analysée/i })).toBeInTheDocument()
    })
  })

  it('shows "Analyse en cours… 0%" and is disabled when densityStatus is pending', async () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({
      densityStatus: 'pending',
      densityProgress: 0,
      coverageGaps: [],
      densityCategories: [],
      densityStale: false,
    })

    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /analyse en cours… 0%/i })).toBeDisabled()
    })
  })

  it('shows progress percentage when densityStatus is processing', async () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({
      densityStatus: 'processing',
      densityProgress: 42,
      coverageGaps: [],
      densityCategories: [],
      densityStale: false,
    })

    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /analyse en cours… 42%/i })).toBeDisabled()
    })
  })

  it('clicking button opens the DensityCategoryDialog (not directly triggers mutation)', async () => {
    const user = userEvent.setup()
    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    const btn = screen.getByRole('button', { name: /calculer la densité/i })
    await user.click(btn)

    expect(screen.getByTestId('density-dialog')).toBeInTheDocument()
    expect(vi.mocked(apiClient.triggerDensityAnalysis)).not.toHaveBeenCalled()
  })

  it('confirming in dialog with categories calls triggerDensityAnalysis with correct body', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.triggerDensityAnalysis).mockResolvedValue({ message: 'ok' })

    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    // Open dialog
    await user.click(screen.getByRole('button', { name: /calculer la densité/i }))
    // Confirm in dialog (mock calls onConfirm with ['hotel', 'hostel'])
    await user.click(screen.getByTestId('confirm-btn'))

    expect(vi.mocked(apiClient.triggerDensityAnalysis)).toHaveBeenCalledWith('adv-1', ['hotel', 'hostel'])
  })

  it('is disabled when not all segments are parsed', () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({
      densityStatus: 'idle',
      densityProgress: 0,
      coverageGaps: [],
      densityCategories: [],
      densityStale: false,
    })

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

  it('shows "Densité analysée" disabled with green class when success and densityStale === false', async () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({
      densityStatus: 'success',
      densityProgress: 100,
      coverageGaps: [],
      densityCategories: ['hotel'],
      densityStale: false,
    })

    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /densité analysée/i })
      expect(btn).toBeDisabled()
      expect(btn.className).toContain('green')
    })
  })

  it('shows "Calculer la densité" enabled when success and densityStale === true', async () => {
    vi.mocked(apiClient.getDensityStatus).mockResolvedValue({
      densityStatus: 'success',
      densityProgress: 100,
      coverageGaps: [],
      densityCategories: ['hotel'],
      densityStale: true,
    })

    renderWithQuery(
      <DensityTriggerButton adventureId="adv-1" segments={[makeDoneSegment()]} />,
    )

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /calculer la densité/i })
      expect(btn).not.toBeDisabled()
    })
  })
})
