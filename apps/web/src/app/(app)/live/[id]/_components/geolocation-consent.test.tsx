import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GeolocationConsent } from './geolocation-consent'

afterEach(cleanup)

describe('GeolocationConsent', () => {
  it('renders dialog with title and explanation text when open', () => {
    render(<GeolocationConsent open onConsent={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('Activer la géolocalisation')).toBeDefined()
    expect(screen.getByText(/GPS/)).toBeDefined()
  })

  it('calls onConsent when "Activer" button is clicked', async () => {
    const onConsent = vi.fn()
    render(<GeolocationConsent open onConsent={onConsent} onDismiss={vi.fn()} />)
    const activateButton = screen.getByRole('button', { name: /activer/i })
    await userEvent.click(activateButton)
    expect(onConsent).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when "Annuler" button is clicked', async () => {
    const onDismiss = vi.fn()
    render(<GeolocationConsent open onConsent={vi.fn()} onDismiss={onDismiss} />)
    const cancelButton = screen.getByRole('button', { name: /annuler/i })
    await userEvent.click(cancelButton)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not render dialog content when open is false', () => {
    render(<GeolocationConsent open={false} onConsent={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByText('Activer la géolocalisation')).toBeNull()
  })

  it('has both Activer and Annuler buttons', () => {
    render(<GeolocationConsent open onConsent={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: /activer/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /annuler/i })).toBeDefined()
  })

  it('does not close on backdrop click (RGPD gate)', async () => {
    const onConsent = vi.fn()
    const onDismiss = vi.fn()
    render(<GeolocationConsent open onConsent={onConsent} onDismiss={onDismiss} />)

    // Click backdrop overlay
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]')
    if (backdrop) await userEvent.click(backdrop)

    // Dialog should still be visible — neither callback was called
    expect(onConsent).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByText('Activer la géolocalisation')).toBeDefined()
  })
})
