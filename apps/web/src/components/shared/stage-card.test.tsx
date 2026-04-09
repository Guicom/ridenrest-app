import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StageCard } from './stage-card'
import type { AdventureStageResponse } from '@ridenrest/shared'

afterEach(cleanup)

// Mock StageWeatherBadge
vi.mock('@/app/(app)/map/[id]/_components/stage-weather-badge', () => ({
  StageWeatherBadge: ({ stageId }: { stageId: string }) => (
    <span data-testid={`weather-badge-${stageId}`}>weather</span>
  ),
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

describe('StageCard', () => {
  describe('planning mode', () => {
    it('renders 3-line layout with name, distance, D+ and D-', () => {
      render(<StageCard stage={makeStage()} mode="planning" />)

      expect(screen.getByText('Jour 1')).toBeInTheDocument()
      expect(screen.getByText('80.0 km')).toBeInTheDocument()
      expect(screen.getByText('↑ 850 m')).toBeInTheDocument()
      expect(screen.getByText('↓ 720 m')).toBeInTheDocument()
    })

    it('shows edit and delete buttons', () => {
      const onEdit = vi.fn()
      const onDelete = vi.fn()
      render(<StageCard stage={makeStage()} mode="planning" onEdit={onEdit} onDelete={onDelete} />)

      expect(screen.getByTestId('edit-stage-s1')).toBeInTheDocument()
      expect(screen.getByTestId('delete-stage-s1')).toBeInTheDocument()
    })

    it('calls onEdit when edit button is clicked', () => {
      const onEdit = vi.fn()
      const stage = makeStage()
      render(<StageCard stage={stage} mode="planning" onEdit={onEdit} />)

      fireEvent.click(screen.getByTestId('edit-stage-s1'))
      expect(onEdit).toHaveBeenCalledWith(stage)
    })

    it('calls onDelete when delete button is clicked', () => {
      const onDelete = vi.fn()
      const stage = makeStage()
      render(<StageCard stage={stage} mode="planning" onDelete={onDelete} />)

      fireEvent.click(screen.getByTestId('delete-stage-s1'))
      expect(onDelete).toHaveBeenCalledWith(stage)
    })

    it('shows dash placeholders when D+ and D- are null', () => {
      render(<StageCard stage={makeStage({ elevationGainM: null, elevationLossM: null })} mode="planning" />)

      expect(screen.getByText('↑ —')).toBeInTheDocument()
      expect(screen.getByText('↓ —')).toBeInTheDocument()
    })

    it('does not show line 3 when departureTime is null', () => {
      render(<StageCard stage={makeStage({ departureTime: null })} mode="planning" />)

      // Only 2 lines rendered (name + stats), no date line
      const container = screen.getByTestId('stage-item-s1')
      // Should have exactly 2 child divs (line 1 + line 2)
      expect(container.children.length).toBe(2)
    })

    it('shows formatted departure time on line 3 when set', () => {
      render(<StageCard stage={makeStage({ departureTime: '2026-04-15T07:30:00.000Z' })} mode="planning" />)

      const container = screen.getByTestId('stage-item-s1')
      // Should have 3 child divs (line 1 + line 2 + line 3)
      expect(container.children.length).toBe(3)
    })

    it('shows weather badge when weatherActive is true', () => {
      render(
        <StageCard
          stage={makeStage()}
          mode="planning"
          weatherActive={true}
          departureTime="2026-03-22T08:00:00.000Z"
          speedKmh={15}
        />,
      )

      expect(screen.getByTestId('weather-badge-s1')).toBeInTheDocument()
    })

    it('does not show weather badge when weatherActive is false', () => {
      render(<StageCard stage={makeStage()} mode="planning" weatherActive={false} />)

      expect(screen.queryByTestId('weather-badge-s1')).not.toBeInTheDocument()
    })

    it('does not show weather badge when stagesHaveDepartures is true', () => {
      render(
        <StageCard
          stage={makeStage()}
          mode="planning"
          weatherActive={true}
          stagesHaveDepartures={true}
        />,
      )

      expect(screen.queryByTestId('weather-badge-s1')).not.toBeInTheDocument()
    })
  })

  describe('live mode', () => {
    it('does not show edit and delete buttons', () => {
      render(<StageCard stage={makeStage()} mode="live" />)

      expect(screen.queryByTestId('edit-stage-s1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('delete-stage-s1')).not.toBeInTheDocument()
    })

    it('applies accent border when isCurrent', () => {
      render(<StageCard stage={makeStage()} mode="live" isCurrent={true} />)

      const container = screen.getByTestId('stage-item-s1')
      expect(container.className).toContain('border-primary')
      expect(container.className).toContain('bg-primary/5')
    })

    it('applies reduced opacity when isPassed', () => {
      render(<StageCard stage={makeStage()} mode="live" isPassed={true} />)

      const container = screen.getByTestId('stage-item-s1')
      expect(container.className).toContain('opacity-50')
    })

    it('shows formatted ETA when etaFromCurrentMinutes is provided (short)', () => {
      render(<StageCard stage={makeStage()} mode="live" etaFromCurrentMinutes={45} />)

      expect(screen.getByText('~45 min')).toBeInTheDocument()
    })

    it('shows formatted ETA with hours when >= 60 min', () => {
      render(<StageCard stage={makeStage()} mode="live" etaFromCurrentMinutes={135} />)

      expect(screen.getByText('~2h15')).toBeInTheDocument()
    })

    it('does not show departure time in live mode even if set', () => {
      render(
        <StageCard
          stage={makeStage({ departureTime: '2026-04-15T07:30:00.000Z' })}
          mode="live"
        />,
      )

      // No line 3 without ETA in live mode (departureTime not shown in live)
      const container = screen.getByTestId('stage-item-s1')
      expect(container.children.length).toBe(2)
    })
  })
})
