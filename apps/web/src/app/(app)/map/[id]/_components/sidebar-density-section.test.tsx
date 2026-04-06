import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarDensitySection } from './sidebar-density-section'
import type { MapSegmentData } from '@ridenrest/shared'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({
  triggerDensityAnalysis: vi.fn(),
}))
vi.mock('@/app/(app)/adventures/[id]/_components/density-category-dialog', () => ({
  DensityCategoryDialog: () => null,
}))
vi.mock('@/components/shared/section-tooltip', () => ({
  SectionTooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockToggleDensityColor = vi.fn()
let mockDensityColorEnabled = false
vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    densityColorEnabled: mockDensityColorEnabled,
    toggleDensityColor: mockToggleDensityColor,
  }),
}))

let mockDensityStatus = 'idle'
let mockDensityStale = false
let mockDensityProgress = 0
vi.mock('@/hooks/use-density', () => ({
  useDensity: () => ({
    coverageGaps: [],
    densityStatus: mockDensityStatus,
    densityCategories: [],
    densityStale: mockDensityStale,
    densityProgress: mockDensityProgress,
    isPending: false,
  }),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled, onClick, ...props }: React.ComponentProps<'button'>) => (
    <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, 'aria-label': ariaLabel, 'data-testid': testId }: { checked?: boolean; onCheckedChange?: () => void; 'aria-label'?: string; 'data-testid'?: string }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={() => onCheckedChange?.()}
    />
  ),
}))

function makeDoneSegment(overrides: Partial<MapSegmentData> = {}): MapSegmentData {
  return {
    id: 'seg-1',
    name: 'Segment 1',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 50,
    parseStatus: 'done',
    waypoints: [{ lat: 1, lng: 2, distKm: 0 }],
    boundingBox: null,
    ...overrides,
  }
}

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

afterEach(cleanup)

beforeEach(() => {
  mockDensityStatus = 'idle'
  mockDensityStale = false
  mockDensityProgress = 0
  mockDensityColorEnabled = false
  mockToggleDensityColor.mockClear()
})

function expandAccordion() {
  fireEvent.click(screen.getByTestId('density-section-header'))
}

describe('SidebarDensitySection — header', () => {
  it('renders section header with Densité label', () => {
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.getByText('Densité')).toBeDefined()
  })

  it('is collapsed by default', () => {
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.queryByTestId('density-cta-btn')).toBeNull()
    expect(screen.queryByTestId('density-toggle')).toBeNull()
  })

  it('clicking header twice collapses again', () => {
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expandAccordion()
    expandAccordion()
    expect(screen.queryByTestId('density-cta-btn')).toBeNull()
  })
})

describe('SidebarDensitySection — CTA state (AC #1)', () => {
  it('shows CTA button when densityStatus === "idle"', () => {
    mockDensityStatus = 'idle'
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expandAccordion()
    expect(screen.getByTestId('density-cta-btn')).toBeInTheDocument()
    expect(screen.getByText(/Calculer la densité/)).toBeInTheDocument()
  })

  it('shows CTA button when densityStatus === "success" and stale', () => {
    mockDensityStatus = 'success'
    mockDensityStale = true
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expandAccordion()
    expect(screen.getByTestId('density-cta-btn')).toBeInTheDocument()
    expect(screen.getByText(/segments ont changé/i)).toBeInTheDocument()
  })

  it('shows idle description when not stale', () => {
    mockDensityStatus = 'idle'
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expandAccordion()
    expect(screen.getByText(/Identifie les zones/i)).toBeInTheDocument()
  })

  it('CTA button is disabled when segments not all parsed', () => {
    mockDensityStatus = 'idle'
    renderWithQuery(
      <SidebarDensitySection
        adventureId="adv-1"
        segments={[makeDoneSegment(), makeDoneSegment({ id: 'seg-2', parseStatus: 'pending' })]}
      />,
    )
    expandAccordion()
    expect(screen.getByTestId('density-cta-btn')).toBeDisabled()
  })

  it('CTA button is disabled when segments is empty', () => {
    mockDensityStatus = 'idle'
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[]} />)
    expandAccordion()
    expect(screen.getByTestId('density-cta-btn')).toBeDisabled()
  })
})

describe('SidebarDensitySection — analyzing state (AC #3)', () => {
  it('shows progress text when pending', () => {
    mockDensityStatus = 'pending'
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expandAccordion()
    expect(screen.getByText(/Analyse en cours/)).toBeInTheDocument()
    expect(screen.queryByTestId('density-cta-btn')).toBeNull()
    expect(screen.queryByTestId('density-toggle')).toBeNull()
  })

  it('shows progress percentage when processing with progress > 0', () => {
    mockDensityStatus = 'processing'
    mockDensityProgress = 45
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expandAccordion()
    expect(screen.getByText(/45%/)).toBeInTheDocument()
  })
})

describe('SidebarDensitySection — done state (AC #4)', () => {
  it('shows toggle and legend when success and not stale', () => {
    mockDensityStatus = 'success'
    mockDensityStale = false
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expandAccordion()
    expect(screen.getByTestId('density-toggle')).toBeInTheDocument()
    expect(screen.getByText(/Bonne disponibilité/)).toBeInTheDocument()
    expect(screen.getByText(/Zone critique/)).toBeInTheDocument()
    expect(screen.queryByTestId('density-cta-btn')).toBeNull()
  })

  it('clicking toggle calls toggleDensityColor', () => {
    mockDensityStatus = 'success'
    mockDensityStale = false
    renderWithQuery(<SidebarDensitySection adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expandAccordion()
    fireEvent.click(screen.getByTestId('density-toggle'))
    expect(mockToggleDensityColor).toHaveBeenCalledTimes(1)
  })
})
