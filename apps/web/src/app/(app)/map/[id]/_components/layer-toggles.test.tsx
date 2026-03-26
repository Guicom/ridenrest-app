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

  it('active layer button uses bg-primary class (design token)', () => {
    mockVisibleLayers = new Set(['accommodations'])
    render(<LayerToggles isPending={false} />)

    const btn = screen.getByLabelText(/Masquer les Hébergements/)
    expect(btn.className).toContain('bg-primary')
    expect(btn.className).not.toContain('bg-blue-500')
  })

  it('renders Météo chip when weatherActive prop is provided', () => {
    render(<LayerToggles isPending={false} weatherActive={false} onWeatherToggle={() => {}} />)
    expect(screen.getByLabelText(/Activer la Météo/)).toBeDefined()
  })

  it('renders Densité chip when densityActive prop is provided', () => {
    render(<LayerToggles isPending={false} densityActive={false} onDensityToggle={() => {}} />)
    expect(screen.getByLabelText(/Activer la Densité/)).toBeDefined()
  })

  it('clicking Météo chip calls onWeatherToggle', () => {
    const onWeatherToggle = vi.fn()
    render(<LayerToggles isPending={false} weatherActive={false} onWeatherToggle={onWeatherToggle} />)
    fireEvent.click(screen.getByLabelText(/Activer la Météo/))
    expect(onWeatherToggle).toHaveBeenCalledTimes(1)
  })

  it('clicking Densité chip calls onDensityToggle', () => {
    const onDensityToggle = vi.fn()
    render(<LayerToggles isPending={false} densityActive={true} onDensityToggle={onDensityToggle} />)
    fireEvent.click(screen.getByLabelText(/Désactiver la Densité/))
    expect(onDensityToggle).toHaveBeenCalledTimes(1)
  })

  it('active Météo chip uses bg-primary class', () => {
    render(<LayerToggles isPending={false} weatherActive={true} onWeatherToggle={() => {}} />)
    const btn = screen.getByLabelText(/Désactiver la Météo/)
    expect(btn.className).toContain('bg-primary')
  })

  it('does not render Météo chip when weatherActive prop not provided', () => {
    render(<LayerToggles isPending={false} />)
    expect(screen.queryByLabelText(/Météo/)).toBeNull()
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

  it('each button has min-h-[40px] class for touch target', () => {
    render(<LayerToggles isPending={false} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
    buttons.forEach((btn) => {
      expect(btn.className).toContain('min-h-[40px]')
    })
  })

  it('inactive layer button has border class (light mode design)', () => {
    render(<LayerToggles isPending={false} />)

    const btn = screen.getByLabelText(/Afficher les Hébergements/)
    expect(btn.className).toContain('border')
    expect(btn.className).toContain('bg-white')
  })

  it('inactive layer button does not have bg-muted class', () => {
    render(<LayerToggles isPending={false} />)

    const btn = screen.getByLabelText(/Afficher les Hébergements/)
    expect(btn.className).not.toContain('bg-muted')
  })

  it('active layer button has bg-primary class', () => {
    mockVisibleLayers = new Set(['accommodations'])
    render(<LayerToggles isPending={false} />)

    const btn = screen.getByLabelText(/Masquer les Hébergements/)
    expect(btn.className).toContain('bg-primary')
  })
})
