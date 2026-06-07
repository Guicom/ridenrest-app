import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { LoginForm } from './login-form'
import { trackLoginCompleted } from '@ridenrest/analytics'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const { mockSignInEmail } = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
}))

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: { email: mockSignInEmail },
  },
}))

vi.mock('@/components/shared/google-sign-in-button', () => ({
  GoogleSignInButton: () => <button>Google</button>,
}))

vi.mock('@ridenrest/analytics', () => ({
  trackLoginCompleted: vi.fn(),
}))

describe('LoginForm — funnel acquisition (posthog)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function submitForm() {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sophie@example.com' } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'motdepasse8' } })
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }))
  }

  it('émet login_completed (email) après connexion réussie', async () => {
    mockSignInEmail.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null })
    render(<LoginForm redirectTo="/adventures" />)
    submitForm()

    await waitFor(() => {
      expect(trackLoginCompleted).toHaveBeenCalledWith({ method: 'email' })
    })
  })

  it('n’émet PAS login_completed en cas d’échec de connexion', async () => {
    mockSignInEmail.mockResolvedValueOnce({ data: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD' } })
    render(<LoginForm redirectTo="/adventures" />)
    submitForm()

    await waitFor(() => {
      expect(screen.getByText(/email ou mot de passe incorrect/i)).toBeInTheDocument()
    })
    expect(trackLoginCompleted).not.toHaveBeenCalled()
  })
})
