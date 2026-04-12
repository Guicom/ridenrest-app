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
  speedKmh: null,
  pauseHours: null,
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

      // Line 1 + line 2 + line 4 (ETA) — no line 3 (no date)
      const container = screen.getByTestId('stage-item-s1')
      expect(container.children.length).toBe(3) // line 1 + line 2 + line 4 ETA
    })

    it('shows formatted departure time on line 3 when set', () => {
      render(<StageCard stage={makeStage({ departureTime: '2026-04-15T07:30:00.000Z' })} mode="planning" />)

      const container = screen.getByTestId('stage-item-s1')
      // line 1 + line 2 + line 3 (date) + line 4 (ETA)
      expect(container.children.length).toBe(4)
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

    it('shows ETA on line 4 when etaMinutes is set (planning)', () => {
      render(<StageCard stage={makeStage({ etaMinutes: 390 })} mode="planning" />)

      expect(screen.getByText(/ETA ~6h30/)).toBeInTheDocument()
    })

    it('does not show line 4 ETA when etaMinutes is null', () => {
      render(<StageCard stage={makeStage({ etaMinutes: null })} mode="planning" />)

      expect(screen.queryByText(/ETA/)).not.toBeInTheDocument()
    })

    it('shows pause info in ETA when pauseHours > 0', () => {
      render(<StageCard stage={makeStage({ etaMinutes: 390, pauseHours: 1 })} mode="planning" />)

      expect(screen.getByText(/ETA ~6h30/)).toBeInTheDocument()
      expect(screen.getByText(/dont ~1h00 pause/)).toBeInTheDocument()
    })

    it('does not show pause info when pauseHours is 0', () => {
      render(<StageCard stage={makeStage({ etaMinutes: 300, pauseHours: 0 })} mode="planning" />)

      expect(screen.getByText(/ETA ~5h00/)).toBeInTheDocument()
      expect(screen.queryByText(/pause/)).not.toBeInTheDocument()
    })

    it('does not show pause info when pauseHours is null', () => {
      render(<StageCard stage={makeStage({ etaMinutes: 300, pauseHours: null })} mode="planning" />)

      expect(screen.getByText(/ETA ~5h00/)).toBeInTheDocument()
      expect(screen.queryByText(/pause/)).not.toBeInTheDocument()
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

      // No line 3 (departure not shown in live), no line 4 ETA (only shown in planning)
      const container = screen.getByTestId('stage-item-s1')
      expect(container.children.length).toBe(2)
    })

    it('does not show line 4 ETA planning in live mode', () => {
      render(<StageCard stage={makeStage({ etaMinutes: 300 })} mode="live" />)

      // ETA planning line only in planning mode
      expect(screen.queryByText(/ETA ~5h00/)).not.toBeInTheDocument()
    })
  })
})
