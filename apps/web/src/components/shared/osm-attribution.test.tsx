import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { OsmAttribution } from './osm-attribution'

afterEach(cleanup)

describe('OsmAttribution', () => {
  it('renders with the OSM link to openstreetmap.org/copyright', () => {
    render(<OsmAttribution />)
    const link = screen.getByRole('link', { name: /openstreetmap/i })
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  it('opens link in _blank with rel="noopener noreferrer"', () => {
    render(<OsmAttribution />)
    const link = screen.getByRole('link', { name: /openstreetmap/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
