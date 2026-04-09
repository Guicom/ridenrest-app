import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LiveStagesSection } from './live-stages-section'
import type { AdventureStageResponse } from '@ridenrest/shared'

afterEach(cleanup)

// Mock StageWeatherBadge (imported by StageCard)
vi.mock('@/app/(app)/map/[id]/_components/stage-weather-badge', () => ({
  StageWeatherBadge: () => null,
}))

const makeStage = (overrides: Partial<AdventureStageResponse> = {}): AdventureStageResponse => ({
  id: 's1',
  adventureId: 'adv-1',
  name: 'Jour 1',
  color: '#f97316',
  orderIndex: 0,
  startKm: 0,
  endKm: 80,
  distanceKm: 80,
  elevationGainM: 850,
  elevationLossM: 720,
  etaMinutes: 300,
  departureTime: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

describe('LiveStagesSection', () => {
  it('does not render when stages is empty', () => {
    render(<LiveStagesSection stages={[]} currentKmOnRoute={10} speedKmh={15} />)
    expect(screen.queryByTestId('live-stages-section')).not.toBeInTheDocument()
  })

  it('renders collapsed by default with stage count', () => {
    const stages = [makeStage(), makeStage({ id: 's2', name: 'Jour 2', orderIndex: 1 })]
    render(<LiveStagesSection stages={stages} currentKmOnRoute={10} speedKmh={15} />)

    expect(screen.getByText('Étapes (2)')).toBeInTheDocument()
    // Stage cards should not be visible when collapsed
    expect(screen.queryByText('Jour 1')).not.toBeInTheDocument()
  })

  it('shows stage cards when expanded', () => {
    const stages = [
      makeStage({ id: 's1', name: 'Jour 1' }),
      makeStage({ id: 's2', name: 'Jour 2', orderIndex: 1, startKm: 80, endKm: 150 }),
    ]
    render(<LiveStagesSection stages={stages} currentKmOnRoute={10} speedKmh={15} />)

    fireEvent.click(screen.getByTestId('live-stages-header'))

    expect(screen.getByText('Jour 1')).toBeInTheDocument()
    expect(screen.getByText('Jour 2')).toBeInTheDocument()
  })

  it('highlights current stage with accent border', () => {
    const stages = [
      makeStage({ id: 's1', name: 'Jour 1', startKm: 0, endKm: 80 }),
      makeStage({ id: 's2', name: 'Jour 2', orderIndex: 1, startKm: 80, endKm: 150, distanceKm: 70 }),
    ]
    // currentKmOnRoute=50 → s1 is current (0 <= 50 < 80)
    render(<LiveStagesSection stages={stages} currentKmOnRoute={50} speedKmh={15} />)
    fireEvent.click(screen.getByTestId('live-stages-header'))

    const s1Container = screen.getByTestId('stage-item-s1')
    expect(s1Container.className).toContain('border-primary')
  })

  it('dims passed stages with reduced opacity', () => {
    const stages = [
      makeStage({ id: 's1', name: 'Jour 1', startKm: 0, endKm: 80 }),
      makeStage({ id: 's2', name: 'Jour 2', orderIndex: 1, startKm: 80, endKm: 150, distanceKm: 70 }),
    ]
    // currentKmOnRoute=100 → s1 is passed (100 >= 80), s2 is current
    render(<LiveStagesSection stages={stages} currentKmOnRoute={100} speedKmh={15} />)
    fireEvent.click(screen.getByTestId('live-stages-header'))

    const s1Container = screen.getByTestId('stage-item-s1')
    expect(s1Container.className).toContain('opacity-50')
  })

  it('shows ETA for current stage', () => {
    const stages = [
      makeStage({ id: 's1', name: 'Jour 1', startKm: 0, endKm: 80 }),
    ]
    // currentKmOnRoute=50, speedKmh=15 → ETA = (80-50)/15*60 = 120 min → ~2h00
    render(<LiveStagesSection stages={stages} currentKmOnRoute={50} speedKmh={15} />)
    fireEvent.click(screen.getByTestId('live-stages-header'))

    expect(screen.getByText('~2h00')).toBeInTheDocument()
  })

  it('does not show edit/delete buttons in live mode', () => {
    const stages = [makeStage()]
    render(<LiveStagesSection stages={stages} currentKmOnRoute={10} speedKmh={15} />)
    fireEvent.click(screen.getByTestId('live-stages-header'))

    expect(screen.queryByTestId('edit-stage-s1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-stage-s1')).not.toBeInTheDocument()
  })
})
