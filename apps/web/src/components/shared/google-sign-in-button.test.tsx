import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { GoogleSignInButton } from './google-sign-in-button'

const { mockSignInSocial } = vi.hoisted(() => ({
  mockSignInSocial: vi.fn(),
}))

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: {
      social: mockSignInSocial,
    },
  },
}))

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    mockSignInSocial.mockReset()
    // Simulate redirect: promise never resolves (redirect happens before it)
    mockSignInSocial.mockReturnValue(new Promise(() => {}))
  })

  afterEach(() => {
    cleanup()
  })

  it('renders "Continuer avec Google" button', () => {
    render(<GoogleSignInButton />)
    const button = screen.getByRole('button')
    expect(button.textContent).toContain('Continuer avec Google')
  })

  it('calls signIn.social with google provider and default callbackURL', async () => {
    render(<GoogleSignInButton />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: '/adventures',
      })
    })
  })

  it('calls signIn.social with provided callbackURL', async () => {
    render(<GoogleSignInButton callbackURL="/custom-path" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: '/custom-path',
      })
    })
  })

  it('resets button to enabled state if signIn.social throws', async () => {
    mockSignInSocial.mockRejectedValueOnce(new Error('Network error'))
    render(<GoogleSignInButton />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      const button = screen.getByRole('button')
      expect((button as HTMLButtonElement).disabled).toBe(false)
      expect(button.textContent).toContain('Continuer avec Google')
    })
  })

  it('shows "Redirection..." and disables button while pending', async () => {
    render(<GoogleSignInButton />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      const button = screen.getByRole('button')
      expect(button.textContent).toBe('Redirection...')
      expect((button as HTMLButtonElement).disabled).toBe(true)
    })
  })
})
