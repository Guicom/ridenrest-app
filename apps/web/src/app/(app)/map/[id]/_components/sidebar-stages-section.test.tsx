import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SidebarStagesSection } from './sidebar-stages-section'
import type { AdventureStageResponse, CreateStageInput, UpdateStageInput } from '@ridenrest/shared'

afterEach(cleanup)

const mockCreateStage = vi.fn()
const mockUpdateStage = vi.fn()
const mockDeleteStage = vi.fn()

// Mock shadcn Dialog
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock shadcn AlertDialog
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}))

// Mock StageWeatherBadge
vi.mock('./stage-weather-badge', () => ({
  StageWeatherBadge: ({ stageId }: { stageId: string }) => (
    <span data-testid={`weather-badge-${stageId}`}>weather</span>
  ),
}))

// Mock shadcn Switch
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; [key: string]: unknown }) =>
    <button role="switch" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)} {...props} />,
}))

// Mock shadcn Input and Label
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) =>
    <label htmlFor={htmlFor}>{children}</label>,
}))

// Mock shadcn Button
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) =>
    <button onClick={onClick} {...props}>{children}</button>,
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
  elevationGainM: null,
  elevationLossM: null,
  etaMinutes: null,
  departureTime: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

const defaultProps = {
  stages: [] as AdventureStageResponse[],
  onEnterClickMode: vi.fn(),
  onExitClickMode: vi.fn(),
  isClickModeActive: false,
  pendingEndKm: null,
  showNamingDialog: false,
  onNamingDialogClose: vi.fn(),
  stagesVisible: true,
  onStagesVisibilityChange: vi.fn(),
  onCreateStage: mockCreateStage as (data: CreateStageInput) => Promise<void>,
  onUpdateStage: mockUpdateStage as (stageId: string, data: UpdateStageInput) => Promise<void>,
  onDeleteStage: mockDeleteStage as (stageId: string) => Promise<void>,
}

/** Click the section header to expand the accordion before asserting on inner content */
function expand() {
  fireEvent.click(screen.getByTestId('stages-section-header'))
}

describe('SidebarStagesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Ajouter une étape" button', () => {
    render(<SidebarStagesSection {...defaultProps} />)
    expand()
    expect(screen.getByTestId('add-stage-btn')).toBeDefined()
  })

  it('calls onEnterClickMode when "Ajouter une étape" is clicked', () => {
    const onEnterClickMode = vi.fn()
    render(<SidebarStagesSection {...defaultProps} onEnterClickMode={onEnterClickMode} />)
    expand()
    fireEvent.click(screen.getByTestId('add-stage-btn'))
    expect(onEnterClickMode).toHaveBeenCalledOnce()
  })

  it('shows cancel button when isClickModeActive is true', () => {
    render(<SidebarStagesSection {...defaultProps} isClickModeActive={true} />)
    expand()
    expect(screen.getByTestId('cancel-click-mode')).toBeDefined()
    expect(screen.queryByTestId('add-stage-btn')).toBeNull()
  })

  it('renders stage list with distance and — placeholders for D+ and D-', () => {
    const stages = [
      makeStage({ id: 's1', name: 'Jour 1', distanceKm: 80, endKm: 80 }),
      makeStage({ id: 's2', name: 'Jour 2', orderIndex: 1, startKm: 80, endKm: 150, distanceKm: 70 }),
    ]
    render(<SidebarStagesSection {...defaultProps} stages={stages} />)
    expand()

    expect(screen.getByText('Jour 1')).toBeDefined()
    expect(screen.getByText('80.0 km')).toBeDefined()
    expect(screen.getByText('Jour 2')).toBeDefined()
    expect(screen.getByText('70.0 km')).toBeDefined()
    // New 3-line layout: D+ and D- are separate spans with arrows
    const gainPlaceholders = screen.getAllByText('↑ —')
    expect(gainPlaceholders.length).toBe(2)
    const lossPlaceholders = screen.getAllByText('↓ —')
    expect(lossPlaceholders.length).toBe(2)
  })

  it('opens edit dialog when pencil icon is clicked', () => {
    const stages = [makeStage()]
    render(<SidebarStagesSection {...defaultProps} stages={stages} />)
    expand()
    fireEvent.click(screen.getByTestId('edit-stage-s1'))
    expect(screen.getByTestId('dialog')).toBeDefined()
    expect(screen.getByText("Modifier l'étape")).toBeDefined()
  })

  it('opens delete AlertDialog when trash icon is clicked', () => {
    const stages = [makeStage()]
    render(<SidebarStagesSection {...defaultProps} stages={stages} />)
    expand()
    fireEvent.click(screen.getByTestId('delete-stage-s1'))
    expect(screen.getByTestId('alert-dialog')).toBeDefined()
    expect(screen.getByText("Supprimer l'étape ?")).toBeDefined()
  })

  it('renders StageWeatherBadge per stage when weatherActive=true', () => {
    const stages = [
      makeStage({ id: 's1', name: 'Jour 1' }),
      makeStage({ id: 's2', name: 'Jour 2', orderIndex: 1 }),
    ]
    render(
      <SidebarStagesSection
        {...defaultProps}
        stages={stages}
        weatherActive={true}
        departureTime="2026-03-22T08:00:00.000Z"
        speedKmh={15}
      />,
    )
    expand()

    expect(screen.getByTestId('weather-badge-s1')).toBeDefined()
    expect(screen.getByTestId('weather-badge-s2')).toBeDefined()
  })

  it('does not render StageWeatherBadge when weatherActive=false', () => {
    const stages = [makeStage({ id: 's1' })]
    render(
      <SidebarStagesSection
        {...defaultProps}
        stages={stages}
        weatherActive={false}
      />,
    )
    expand()

    expect(screen.queryByTestId('weather-badge-s1')).toBeNull()
  })

  it('does not render StageWeatherBadge when weatherActive is not provided (default)', () => {
    const stages = [makeStage({ id: 's1' })]
    render(<SidebarStagesSection {...defaultProps} stages={stages} />)
    expand()

    expect(screen.queryByTestId('weather-badge-s1')).toBeNull()
  })
})
