import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarDensityCta } from './sidebar-density-cta'
import type { MapSegmentData } from '@ridenrest/shared'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({
  triggerDensityAnalysis: vi.fn(),
}))
vi.mock('@/app/(app)/adventures/[id]/_components/density-category-dialog', () => ({
  DensityCategoryDialog: () => null,
}))

let mockDensityStatus = 'idle'
let mockDensityStale = false
vi.mock('@/hooks/use-density', () => ({
  useDensity: () => ({
    coverageGaps: [],
    densityStatus: mockDensityStatus,
    densityCategories: [],
    densityStale: mockDensityStale,
    isPending: false,
  }),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled, onClick, ...props }: React.ComponentProps<'button'>) => (
    <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
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
})

describe('SidebarDensityCta', () => {
  it('renders when densityStatus === "idle"', () => {
    mockDensityStatus = 'idle'
    renderWithQuery(<SidebarDensityCta adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.getByTestId('sidebar-density-cta-btn')).toBeInTheDocument()
  })

  it('renders when densityStatus === "success" and densityStale === true', () => {
    mockDensityStatus = 'success'
    mockDensityStale = true
    renderWithQuery(<SidebarDensityCta adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.getByTestId('sidebar-density-cta-btn')).toBeInTheDocument()
  })

  it('renders null when densityStatus === "success" and densityStale === false', () => {
    mockDensityStatus = 'success'
    mockDensityStale = false
    renderWithQuery(<SidebarDensityCta adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.queryByTestId('sidebar-density-cta-btn')).toBeNull()
  })

  it('renders null when densityStatus === "processing"', () => {
    mockDensityStatus = 'processing'
    renderWithQuery(<SidebarDensityCta adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.queryByTestId('sidebar-density-cta-btn')).toBeNull()
  })

  it('renders null when densityStatus === "pending"', () => {
    mockDensityStatus = 'pending'
    renderWithQuery(<SidebarDensityCta adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.queryByTestId('sidebar-density-cta-btn')).toBeNull()
  })

  it('button is disabled when not all segments parsed', () => {
    mockDensityStatus = 'idle'
    renderWithQuery(
      <SidebarDensityCta
        adventureId="adv-1"
        segments={[makeDoneSegment(), makeDoneSegment({ id: 'seg-2', parseStatus: 'pending' })]}
      />,
    )
    expect(screen.getByTestId('sidebar-density-cta-btn')).toBeDisabled()
  })

  it('button is disabled when segments is empty', () => {
    mockDensityStatus = 'idle'
    renderWithQuery(<SidebarDensityCta adventureId="adv-1" segments={[]} />)
    expect(screen.getByTestId('sidebar-density-cta-btn')).toBeDisabled()
  })

  it('shows stale description when densityStale is true', () => {
    mockDensityStatus = 'success'
    mockDensityStale = true
    renderWithQuery(<SidebarDensityCta adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.getByText(/segments ont changé/i)).toBeInTheDocument()
  })

  it('renders null when densityStatus === "error"', () => {
    mockDensityStatus = 'error'
    renderWithQuery(<SidebarDensityCta adventureId="adv-1" segments={[makeDoneSegment()]} />)
    expect(screen.queryByTestId('sidebar-density-cta-btn')).toBeNull()
  })
})
