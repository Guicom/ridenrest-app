import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LayerToggles } from './layer-toggles'

afterEach(cleanup)

const mockToggleLayer = vi.fn()
let mockVisibleLayers = new Set<string>()

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    visibleLayers: mockVisibleLayers,
    toggleLayer: mockToggleLayer,
  }),
}))

// Mock Skeleton component
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

describe('LayerToggles', () => {
  afterEach(() => {
    mockToggleLayer.mockClear()
    mockVisibleLayers = new Set()
  })

  it('renders 4 toggle buttons with correct icons and labels', () => {
    render(<LayerToggles isPending={false} />)

    expect(screen.getByText('Hébergements')).toBeDefined()
    expect(screen.getByText('Restauration')).toBeDefined()
    expect(screen.getByText('Alimentation')).toBeDefined()
    expect(screen.getByText('Vélo')).toBeDefined()
  })

  it('clicking a button calls toggleLayer with correct layer', () => {
    render(<LayerToggles isPending={false} />)

    fireEvent.click(screen.getByLabelText(/Afficher les Hébergements/))
    expect(mockToggleLayer).toHaveBeenCalledWith('accommodations')

    fireEvent.click(screen.getByLabelText(/Afficher les Restauration/))
    expect(mockToggleLayer).toHaveBeenCalledWith('restaurants')
  })

  it('active layer button has aria-pressed="true"', () => {
    mockVisibleLayers = new Set(['accommodations'])
    render(<LayerToggles isPending={false} />)

    const accommodationsBtn = screen.getByLabelText(/Masquer les Hébergements/)
    expect(accommodationsBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('inactive layer button has aria-pressed="false"', () => {
    render(<LayerToggles isPending={false} />)

    const accommodationsBtn = screen.getByLabelText(/Afficher les Hébergements/)
    expect(accommodationsBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('active layer button has active color class', () => {
    mockVisibleLayers = new Set(['accommodations'])
    render(<LayerToggles isPending={false} />)

    const btn = screen.getByLabelText(/Masquer les Hébergements/)
    expect(btn.className).toContain('bg-blue-500')
  })

  it('shows Skeleton in active layer button when isPending=true', () => {
    mockVisibleLayers = new Set(['accommodations'])
    render(<LayerToggles isPending={true} />)

    expect(screen.getByTestId('skeleton')).toBeDefined()
    // Inactive layers should not show skeleton
    expect(screen.getByText('Restauration')).toBeDefined()
  })

  it('does not show Skeleton when isPending=false', () => {
    mockVisibleLayers = new Set(['accommodations'])
    render(<LayerToggles isPending={false} />)

    expect(screen.queryByTestId('skeleton')).toBeNull()
    expect(screen.getByText('Hébergements')).toBeDefined()
  })

  it('each button has min-h-[48px] class for touch target', () => {
    render(<LayerToggles isPending={false} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
    buttons.forEach((btn) => {
      expect(btn.className).toContain('min-h-[48px]')
    })
  })
})
