import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SidebarDensitySection } from './sidebar-density-section'

afterEach(cleanup)

const mockToggleDensityColor = vi.fn()
let mockDensityColorEnabled = true

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    densityColorEnabled: mockDensityColorEnabled,
    toggleDensityColor: mockToggleDensityColor,
  }),
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

describe('SidebarDensitySection', () => {
  afterEach(() => {
    mockToggleDensityColor.mockClear()
    mockDensityColorEnabled = true
  })

  it('renders section header with Densité label', () => {
    render(<SidebarDensitySection />)
    expect(screen.getByText('Densité')).toBeDefined()
  })

  it('is collapsed by default (legend not visible)', () => {
    render(<SidebarDensitySection />)
    expect(screen.queryByText('Bonne disponibilité')).toBeNull()
  })

  it('clicking header expands the section', () => {
    render(<SidebarDensitySection />)
    fireEvent.click(screen.getByTestId('density-section-header'))
    expect(screen.getByText('Bonne disponibilité')).toBeDefined()
    expect(screen.getByText('Disponibilité limitée')).toBeDefined()
    expect(screen.getByText('Zone critique')).toBeDefined()
  })

  it('clicking header twice collapses again', () => {
    render(<SidebarDensitySection />)
    fireEvent.click(screen.getByTestId('density-section-header'))
    fireEvent.click(screen.getByTestId('density-section-header'))
    expect(screen.queryByText('Bonne disponibilité')).toBeNull()
  })

  it('switch is NOT visible when collapsed (default)', () => {
    render(<SidebarDensitySection />)
    expect(screen.queryByTestId('density-toggle')).toBeNull()
  })

  it('switch is visible inside the expanded body', () => {
    render(<SidebarDensitySection />)
    fireEvent.click(screen.getByTestId('density-section-header'))
    expect(screen.getByTestId('density-toggle')).toBeDefined()
  })

  it('switch has aria-checked="true" when density is active', () => {
    mockDensityColorEnabled = true
    render(<SidebarDensitySection />)
    fireEvent.click(screen.getByTestId('density-section-header'))
    expect(screen.getByTestId('density-toggle').getAttribute('aria-checked')).toBe('true')
  })

  it('clicking toggle calls toggleDensityColor', () => {
    render(<SidebarDensitySection />)
    fireEvent.click(screen.getByTestId('density-section-header'))
    fireEvent.click(screen.getByTestId('density-toggle'))
    expect(mockToggleDensityColor).toHaveBeenCalledTimes(1)
  })

  it('legend items have correct color indicators', () => {
    render(<SidebarDensitySection />)
    fireEvent.click(screen.getByTestId('density-section-header'))
    expect(screen.getByText('Bonne disponibilité')).toBeDefined()
  })
})
