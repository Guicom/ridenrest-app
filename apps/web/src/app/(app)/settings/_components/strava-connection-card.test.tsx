import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { StravaConnectionCard } from './strava-connection-card'

const { mockLinkSocial, mockDisconnectStrava } = vi.hoisted(() => ({
  mockLinkSocial: vi.fn(),
  mockDisconnectStrava: vi.fn(),
}))

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    oauth2: {
      link: mockLinkSocial,
    },
  },
}))

vi.mock('../actions', () => ({
  disconnectStrava: mockDisconnectStrava,
}))

describe('StravaConnectionCard', () => {
  beforeEach(() => {
    mockLinkSocial.mockReset()
    mockDisconnectStrava.mockReset()
    // linkSocial redirects — promise never resolves in normal flow
    mockLinkSocial.mockReturnValue(new Promise(() => {}))
    mockDisconnectStrava.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    cleanup()
  })

  describe('when NOT connected', () => {
    it('renders "Connecter Strava" button and "Non connecté" status', () => {
      render(<StravaConnectionCard isConnected={false} />)
      expect(screen.getByRole('button').textContent).toContain('Connecter Strava')
      expect(screen.getByText('Non connecté')).toBeTruthy()
    })

    it('calls authClient.oauth2.link with strava provider on click', async () => {
      render(<StravaConnectionCard isConnected={false} />)
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        expect(mockLinkSocial).toHaveBeenCalledWith({
          providerId: 'strava',
          callbackURL: '/settings',
        })
      })
    })

    it('shows "Redirection..." and disables button while pending', async () => {
      render(<StravaConnectionCard isConnected={false} />)
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        const button = screen.getByRole('button')
        expect(button.textContent).toBe('Redirection...')
        expect((button as HTMLButtonElement).disabled).toBe(true)
      })
    })

    it('re-enables button if linkSocial throws (finally block)', async () => {
      mockLinkSocial.mockRejectedValueOnce(new Error('OAuth error'))
      render(<StravaConnectionCard isConnected={false} />)
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        const button = screen.getByRole('button')
        expect((button as HTMLButtonElement).disabled).toBe(false)
        expect(button.textContent).toContain('Connecter Strava')
      })
    })

    it('re-enables button if linkSocial resolves without redirecting', async () => {
      mockLinkSocial.mockResolvedValueOnce(undefined)
      render(<StravaConnectionCard isConnected={false} />)
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        const button = screen.getByRole('button')
        expect((button as HTMLButtonElement).disabled).toBe(false)
      })
    })
  })

  describe('when connected', () => {
    it('renders "Déconnecter" button and "Compte connecté" status', () => {
      render(<StravaConnectionCard isConnected={true} />)
      expect(screen.getByRole('button').textContent).toContain('Déconnecter')
      expect(screen.getByText('Compte connecté')).toBeTruthy()
    })

    it('calls disconnectStrava server action on click', async () => {
      render(<StravaConnectionCard isConnected={true} />)
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        expect(mockDisconnectStrava).toHaveBeenCalledOnce()
      })
    })

    it('shows error message when disconnectStrava returns failure', async () => {
      mockDisconnectStrava.mockResolvedValueOnce({
        success: false,
        error: 'Impossible de déconnecter Strava. Réessaie dans quelques instants.',
      })
      render(<StravaConnectionCard isConnected={true} />)
      fireEvent.click(screen.getByRole('button'))
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('Impossible de déconnecter Strava')
      })
    })
  })
})
