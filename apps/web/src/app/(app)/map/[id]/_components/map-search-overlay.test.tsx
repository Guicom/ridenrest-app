import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MapSearchOverlay } from './map-search-overlay'

afterEach(cleanup)

describe('MapSearchOverlay', () => {
  it('renders nothing when visible=false', () => {
    const { container } = render(<MapSearchOverlay visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders overlay with "Recherche en cours…" when visible=true', () => {
    render(<MapSearchOverlay visible={true} />)
    expect(screen.getByText('Recherche en cours…')).toBeInTheDocument()
  })

  it('renders custom message when provided', () => {
    render(<MapSearchOverlay visible={true} message="Chargement météo…" />)
    expect(screen.getByText('Chargement météo…')).toBeInTheDocument()
  })

  it('renders Loader2 spinner when visible=true', () => {
    const { container } = render(<MapSearchOverlay visible={true} />)
    // Loader2 renders as an svg with animate-spin class
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })
})
