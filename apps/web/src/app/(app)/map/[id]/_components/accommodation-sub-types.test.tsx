import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AccommodationSubTypes } from './accommodation-sub-types'
import type { PoiCategory } from '@ridenrest/shared'

afterEach(cleanup)

const mockToggleAccommodationType = vi.fn()
let mockActiveAccommodationTypes = new Set<PoiCategory>(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    activeAccommodationTypes: mockActiveAccommodationTypes,
    toggleAccommodationType: mockToggleAccommodationType,
  }),
}))

describe('AccommodationSubTypes', () => {
  afterEach(() => {
    mockToggleAccommodationType.mockClear()
    mockActiveAccommodationTypes = new Set<PoiCategory>(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
  })

  it('renders all 5 chips (Hôtel, Camping, Refuge, Auberge de jeunesse, Chambre d\'hôte)', () => {
    render(<AccommodationSubTypes />)
    expect(screen.getByText(/Hôtel/)).toBeDefined()
    expect(screen.getByText(/Camping/)).toBeDefined()
    expect(screen.getByText(/Refuge/)).toBeDefined()
    expect(screen.getByText(/Auberge de jeunesse/)).toBeDefined()
    expect(screen.getByText(/Chambre d'hôte/)).toBeDefined()
  })

  it('clicking a chip calls toggleAccommodationType with correct type', () => {
    render(<AccommodationSubTypes />)
    fireEvent.click(screen.getByText(/Camping/))
    expect(mockToggleAccommodationType).toHaveBeenCalledWith('camp_site')
  })

  it('active chip has aria-pressed="true"', () => {
    render(<AccommodationSubTypes />)
    const buttons = screen.getAllByRole('button')
    // All 5 are active by default
    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-pressed')).toBe('true')
    })
  })

  it('inactive chip has aria-pressed="false"', () => {
    mockActiveAccommodationTypes = new Set<PoiCategory>()
    render(<AccommodationSubTypes />)
    const buttons = screen.getAllByRole('button')
    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-pressed')).toBe('false')
    })
  })

  it('renders section label', () => {
    render(<AccommodationSubTypes />)
    expect(screen.getByText("Type d'hébergement")).toBeDefined()
  })
})
