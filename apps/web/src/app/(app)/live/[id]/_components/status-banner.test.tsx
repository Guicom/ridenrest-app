import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StatusBanner } from './status-banner'

afterEach(cleanup)

describe('StatusBanner', () => {
  it('renders the message text', () => {
    render(<StatusBanner variant="error" message="Connexion instable — 5 hébergements chargés" />)
    expect(screen.getByText('Connexion instable — 5 hébergements chargés')).toBeDefined()
  })

  it('applies destructive classes for variant="offline"', () => {
    render(<StatusBanner variant="offline" message="Mode hors ligne" />)
    const banner = screen.getByRole('status')
    expect(banner.className).toContain('bg-destructive')
    expect(banner.className).toContain('text-destructive-foreground')
  })

  it('applies amber classes for variant="error"', () => {
    render(<StatusBanner variant="error" message="Connexion instable" />)
    const banner = screen.getByRole('status')
    expect(banner.className).toContain('bg-amber-500')
    expect(banner.className).toContain('text-white')
  })

  it('has role="status" and aria-live="polite"', () => {
    render(<StatusBanner variant="error" message="Test" />)
    const banner = screen.getByRole('status')
    expect(banner.getAttribute('aria-live')).toBe('polite')
  })

  it('has data-testid="status-banner"', () => {
    render(<StatusBanner variant="error" message="Test" />)
    expect(screen.getByTestId('status-banner')).toBeDefined()
  })
})
