import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DensityLegend } from './density-legend'

afterEach(cleanup)

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Map: () => <svg data-testid="map-icon" />,
}))

// Mock accommodation-sub-types
vi.mock('./accommodation-sub-types', () => ({
  ACCOMMODATION_SUB_TYPES: [
    { type: 'hotel',      label: 'Hôtel',               color: '#F97316' },
    { type: 'camp_site',  label: 'Camping',              color: '#38BDF8' },
    { type: 'shelter',    label: 'Refuge / Abri',        color: '#84CC16' },
    { type: 'hostel',     label: 'Auberge de jeunesse',  color: '#8B5CF6' },
    { type: 'guesthouse', label: "Chambre d'hôte",       color: '#EC4899' },
  ],
}))

// Mock useMapStore
let mockDensityColorEnabled = true
const mockToggleDensityColor = vi.fn()

const mockStore = {
  densityColorEnabled: true,
  toggleDensityColor: mockToggleDensityColor,
}

vi.mock('@/stores/map.store', () => {
  const useMapStore = (selector?: (s: typeof mockStore) => unknown) => {
    mockStore.densityColorEnabled = mockDensityColorEnabled
    if (selector) return selector(mockStore)
    return mockStore
  }
  useMapStore.getState = () => ({ ...mockStore, densityColorEnabled: mockDensityColorEnabled, toggleDensityColor: mockToggleDensityColor })
  return { useMapStore }
})

describe('DensityLegend', () => {
  beforeEach(() => {
    mockDensityColorEnabled = true
    mockToggleDensityColor.mockReset()
  })

  it('renders the legend trigger button with aria-label', () => {
    render(<DensityLegend />)
    const button = screen.getByRole('button', { name: /légende de densité/i })
    expect(button).toBeDefined()
  })

  it('renders map icon inside trigger', () => {
    render(<DensityLegend />)
    expect(screen.getByTestId('map-icon')).toBeDefined()
  })

  it('does not show popover content by default', () => {
    render(<DensityLegend />)
    // The severity labels should not be visible before clicking
    expect(screen.queryByText(/Bonne disponibilité/i)).toBeNull()
  })

  it('opens popover on click and shows all 3 severity rows', async () => {
    const user = userEvent.setup()
    render(<DensityLegend />)

    const button = screen.getByRole('button', { name: /légende de densité/i })
    await user.click(button)

    expect(screen.getByText(/Bonne disponibilité/i)).toBeDefined()
    expect(screen.getByText(/Disponibilité limitée/i)).toBeDefined()
    expect(screen.getByText(/Zone critique/i)).toBeDefined()
  })

  it('shows density detail text for each severity', async () => {
    const user = userEvent.setup()
    render(<DensityLegend />)

    await user.click(screen.getByRole('button', { name: /légende de densité/i }))

    expect(screen.getByText(/2\+ hébergements \/ 10km/i)).toBeDefined()
    expect(screen.getByText(/1 hébergement \/ 10km/i)).toBeDefined()
    expect(screen.getByText(/Aucun hébergement \/ 10km/i)).toBeDefined()
  })

  it('renders 3 colored swatches with aria-hidden inside the legend list', async () => {
    const user = userEvent.setup()
    render(<DensityLegend />)

    await user.click(screen.getByRole('button', { name: /légende de densité/i }))

    // Swatches are <div aria-hidden="true"> inside <li> elements
    const listItems = document.querySelectorAll('li')
    const swatches = Array.from(listItems).filter((li) => li.querySelector('[aria-hidden="true"]'))
    expect(swatches.length).toBe(3)
  })

  it('shows toggle switch checked when densityColorEnabled=true', async () => {
    mockDensityColorEnabled = true
    const user = userEvent.setup()
    render(<DensityLegend />)
    await user.click(screen.getByRole('button', { name: /légende de densité/i }))

    const toggle = screen.getByRole('switch', { name: /activer\/désactiver/i })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  it('calls toggleDensityColor when switch is clicked', async () => {
    const user = userEvent.setup()
    render(<DensityLegend />)
    await user.click(screen.getByRole('button', { name: /légende de densité/i }))

    const toggle = screen.getByRole('switch', { name: /activer\/désactiver/i })
    await user.click(toggle)

    expect(mockToggleDensityColor).toHaveBeenCalledTimes(1)
  })

  it('shows categories label when densityCategories provided', async () => {
    const user = userEvent.setup()
    render(<DensityLegend densityCategories={['hotel', 'hostel']} />)
    await user.click(screen.getByRole('button', { name: /légende de densité/i }))

    const label = screen.getByText(/Analysé :/i)
    expect(label).toBeDefined()
    expect(label.textContent).toContain('Hôtel')
    expect(label.textContent).toContain('Auberge de jeunesse')
  })

  it('does not show categories label when densityCategories is empty', async () => {
    const user = userEvent.setup()
    render(<DensityLegend densityCategories={[]} />)
    await user.click(screen.getByRole('button', { name: /légende de densité/i }))

    expect(screen.queryByText(/Analysé :/i)).toBeNull()
  })

  it('does not show categories label when densityCategories is not provided', async () => {
    const user = userEvent.setup()
    render(<DensityLegend />)
    await user.click(screen.getByRole('button', { name: /légende de densité/i }))

    expect(screen.queryByText(/Analysé :/i)).toBeNull()
  })
})
