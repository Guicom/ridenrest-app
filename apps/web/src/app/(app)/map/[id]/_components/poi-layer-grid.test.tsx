import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PoiLayerGrid } from './poi-layer-grid'

afterEach(cleanup)

const mockToggleLayer = vi.fn()
let mockVisibleLayers = new Set<string>()

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    visibleLayers: mockVisibleLayers,
    toggleLayer: mockToggleLayer,
  }),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

describe('PoiLayerGrid', () => {
  afterEach(() => {
    mockToggleLayer.mockClear()
    mockVisibleLayers = new Set()
  })

  it('renders 4 buttons', () => {
    render(<PoiLayerGrid isPending={false} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
  })

  it('clicking a card calls toggleLayer with correct layer', () => {
    render(<PoiLayerGrid isPending={false} />)
    fireEvent.click(screen.getByLabelText(/Afficher les Hébergements/))
    expect(mockToggleLayer).toHaveBeenCalledWith('accommodations')
  })

  it('active card has bg-primary class', () => {
    mockVisibleLayers = new Set(['accommodations'])
    render(<PoiLayerGrid isPending={false} />)
    const btn = screen.getByLabelText(/Masquer les Hébergements/)
    expect(btn.className).toContain('bg-primary')
    expect(btn.className).toContain('rounded-xl')
  })

  it('active card has aria-pressed="true"', () => {
    mockVisibleLayers = new Set(['bike'])
    render(<PoiLayerGrid isPending={false} />)
    const btn = screen.getByLabelText(/Masquer les Vélo/)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('inactive card has aria-pressed="false"', () => {
    render(<PoiLayerGrid isPending={false} />)
    const btn = screen.getByLabelText(/Afficher les Hébergements/)
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('shows Skeleton in active card when isPending=true', () => {
    mockVisibleLayers = new Set(['accommodations'])
    render(<PoiLayerGrid isPending={true} />)
    expect(screen.getByTestId('skeleton')).toBeDefined()
  })
})
