import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AccommodationSubTypes } from './accommodation-sub-types'
import type { Poi, PoiCategory } from '@ridenrest/shared'

afterEach(cleanup)

const mockToggleAccommodationType = vi.fn()
let mockActiveAccommodationTypes = new Set<PoiCategory>(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    activeAccommodationTypes: mockActiveAccommodationTypes,
    toggleAccommodationType: mockToggleAccommodationType,
  }),
}))

const makePoi = (category: PoiCategory): Poi =>
  ({ id: `${category}-1`, category, name: category, lat: 0, lng: 0 }) as unknown as Poi

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

  it('renders no badge when accommodationPois is undefined', () => {
    render(<AccommodationSubTypes />)
    expect(screen.queryByText(/\(0\)/)).toBeNull()
  })

  it('renders count for all sub-types when accommodationPois provided', () => {
    const pois: Poi[] = [makePoi('hotel'), makePoi('hotel'), makePoi('camp_site')]
    render(<AccommodationSubTypes accommodationPois={pois} />)
    expect(screen.getByText(/Hôtel \(2\)/)).toBeDefined()
    expect(screen.getByText(/Camping \(1\)/)).toBeDefined()
    // shelter has 0 results — shows (0)
    expect(screen.getByText(/Refuge \/ Abri \(0\)/)).toBeDefined()
  })

  it('greyed-out chip when count = 0 — has opacity-50 class', () => {
    const pois: Poi[] = [makePoi('hotel')]
    render(<AccommodationSubTypes accommodationPois={pois} />)
    const campingBtn = screen.getByText(/Camping \(0\)/).closest('button')
    expect(campingBtn?.className).toContain('opacity-50')
  })

  it('chip with zero results is still tappable (calls toggleAccommodationType)', () => {
    const pois: Poi[] = [makePoi('hotel')]
    render(<AccommodationSubTypes accommodationPois={pois} />)
    fireEvent.click(screen.getByText(/Camping \(0\)/))
    expect(mockToggleAccommodationType).toHaveBeenCalledWith('camp_site')
  })

  it('chip with results shows normal active style (not greyed out)', () => {
    const pois: Poi[] = [makePoi('hotel'), makePoi('camp_site')]
    render(<AccommodationSubTypes accommodationPois={pois} />)
    const campingBtn = screen.getByText(/Camping \(1\)/).closest('button')
    expect(campingBtn?.className).not.toContain('opacity-60')
  })
})
