import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { StravaConnectionCard } from './strava-connection-card'

const { mockLinkSocial, mockDisconnectStrava, mockIsStravaEnabled } = vi.hoisted(() => ({
  mockLinkSocial: vi.fn(),
  mockDisconnectStrava: vi.fn(),
  mockIsStravaEnabled: vi.fn().mockReturnValue(true),
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

vi.mock('@/lib/strava-config', () => ({
  isStravaEnabled: mockIsStravaEnabled,
}))

describe('StravaConnectionCard', () => {
  beforeEach(() => {
    mockLinkSocial.mockReset()
    mockDisconnectStrava.mockReset()
    mockIsStravaEnabled.mockReturnValue(true)
    // linkSocial redirects — promise never resolves in normal flow
    mockLinkSocial.mockReturnValue(new Promise(() => {}))
    mockDisconnectStrava.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    cleanup()
  })

  describe('when NOT connected', () => {
    it('renders official "Connect with Strava" button and "Non connecté" status', () => {
      render(<StravaConnectionCard isConnected={false} />)
      const img = screen.getByAltText('Connect with Strava') as HTMLImageElement
      expect(img).toBeTruthy()
      expect(img.src).toContain('btn_strava_connect_with_white.svg')
      expect(screen.getByText('Non connecté')).toBeTruthy()
    })

    it('calls authClient.oauth2.link with strava provider on click', async () => {
      render(<StravaConnectionCard isConnected={false} />)
      fireEvent.click(screen.getByAltText('Connect with Strava'))
      await waitFor(() => {
        expect(mockLinkSocial).toHaveBeenCalledWith({
          providerId: 'strava',
          callbackURL: '/settings',
        })
      })
    })

    it('disables button while pending', async () => {
      render(<StravaConnectionCard isConnected={false} />)
      fireEvent.click(screen.getByAltText('Connect with Strava'))
      await waitFor(() => {
        const button = screen.getByAltText('Connect with Strava').closest('button') as HTMLButtonElement
        expect(button.disabled).toBe(true)
      })
    })

    it('re-enables button if linkSocial throws (finally block)', async () => {
      mockLinkSocial.mockRejectedValueOnce(new Error('OAuth error'))
      render(<StravaConnectionCard isConnected={false} />)
      fireEvent.click(screen.getByAltText('Connect with Strava'))
      await waitFor(() => {
        const button = screen.getByAltText('Connect with Strava').closest('button') as HTMLButtonElement
        expect(button.disabled).toBe(false)
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

  describe('feature flag STRAVA_ENABLED', () => {
    it('greys out Connect button when STRAVA_ENABLED=false and not connected', () => {
      mockIsStravaEnabled.mockReturnValue(false)
      render(<StravaConnectionCard isConnected={false} />)
      const button = screen.getByAltText('Connect with Strava').closest('button') as HTMLButtonElement
      expect(button.disabled).toBe(true)
      expect(button.className).toContain('opacity-50')
      expect(screen.getByText(/temporairement indisponible/)).toBeTruthy()
    })

    it('keeps Connect button active when STRAVA_ENABLED=false but already connected', () => {
      mockIsStravaEnabled.mockReturnValue(false)
      render(<StravaConnectionCard isConnected={true} />)
      const button = screen.getByRole('button')
      expect(button.textContent).toContain('Déconnecter')
      expect((button as HTMLButtonElement).disabled).toBe(false)
      expect(screen.queryByText(/temporairement indisponible/)).toBeNull()
    })

    it('keeps Connect button fully active when STRAVA_ENABLED=true', () => {
      mockIsStravaEnabled.mockReturnValue(true)
      render(<StravaConnectionCard isConnected={false} />)
      const button = screen.getByAltText('Connect with Strava').closest('button') as HTMLButtonElement
      expect(button.disabled).toBe(false)
      expect(button.className).not.toContain('opacity-50')
      expect(screen.queryByText(/temporairement indisponible/)).toBeNull()
    })
  })
})
