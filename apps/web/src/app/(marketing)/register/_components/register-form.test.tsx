import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { RegisterForm } from './register-form'
import { trackSignupStarted, trackSignupCompleted } from '@ridenrest/analytics'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const { mockSignUpEmail } = vi.hoisted(() => ({
  mockSignUpEmail: vi.fn().mockResolvedValue({ data: null, error: null }),
}))

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signUp: { email: mockSignUpEmail },
  },
}))

vi.mock('@/components/shared/google-sign-in-button', () => ({
  GoogleSignInButton: () => <button>Google</button>,
}))

vi.mock('@ridenrest/analytics', () => ({
  trackSignupStarted: vi.fn(),
  trackSignupCompleted: vi.fn(),
}))

describe('RegisterForm — password visibility toggle', () => {
  afterEach(() => cleanup())

  it('password field starts as type="password"', () => {
    render(<RegisterForm />)
    expect((screen.getByLabelText('Mot de passe') as HTMLInputElement).type).toBe('password')
    expect((screen.getByLabelText('Confirmer le mot de passe') as HTMLInputElement).type).toBe(
      'password'
    )
  })

  it('clicking eye icon on password field toggles type to text', () => {
    render(<RegisterForm />)
    const toggleButtons = screen.getAllByRole('button', { name: /afficher le mot de passe/i })
    // First toggle is for the password field (DOM order matches field order)
    fireEvent.click(toggleButtons[0])
    expect((screen.getByLabelText('Mot de passe') as HTMLInputElement).type).toBe('text')
    // confirmPassword should still be password
    expect((screen.getByLabelText('Confirmer le mot de passe') as HTMLInputElement).type).toBe(
      'password'
    )
  })

  it('clicking eye icon on confirmPassword field toggles independently', () => {
    render(<RegisterForm />)
    const toggleButtons = screen.getAllByRole('button', { name: /afficher le mot de passe/i })
    // Click the second toggle (confirmPassword)
    fireEvent.click(toggleButtons[1])
    expect((screen.getByLabelText('Mot de passe') as HTMLInputElement).type).toBe('password')
    expect((screen.getByLabelText('Confirmer le mot de passe') as HTMLInputElement).type).toBe(
      'text'
    )
  })

  it('clicking eye icon again hides password (toggle back)', () => {
    render(<RegisterForm />)
    const toggleButtons = screen.getAllByRole('button', { name: /afficher le mot de passe/i })
    // Show
    fireEvent.click(toggleButtons[0])
    // Hide - button label changes to "Masquer..."
    const hideButton = screen.getAllByRole('button', { name: /masquer le mot de passe/i })[0]
    fireEvent.click(hideButton)
    expect((screen.getByLabelText('Mot de passe') as HTMLInputElement).type).toBe('password')
  })
})

describe('RegisterForm — funnel acquisition (posthog)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function fillValidForm() {
    fireEvent.change(screen.getByLabelText("Nom d'affichage"), { target: { value: 'Sophie' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sophie@example.com' } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'motdepasse8' } })
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
      target: { value: 'motdepasse8' },
    })
  }

  it('émet signup_started (email) à la soumission valide', async () => {
    mockSignUpEmail.mockResolvedValueOnce({ data: null, error: { code: 'USER_ALREADY_EXISTS' } })
    render(<RegisterForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }))

    await waitFor(() => {
      expect(trackSignupStarted).toHaveBeenCalledWith({ method: 'email' })
    })
    // Échec (compte existant) → pas de completed
    expect(trackSignupCompleted).not.toHaveBeenCalled()
  })

  it('émet signup_completed (email) après création réussie', async () => {
    mockSignUpEmail.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null })
    render(<RegisterForm />)
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }))

    await waitFor(() => {
      expect(trackSignupCompleted).toHaveBeenCalledWith({ method: 'email' })
    })
  })

  it('n’émet rien si la validation client échoue (formulaire vide)', async () => {
    render(<RegisterForm />)
    fireEvent.click(screen.getByRole('button', { name: /créer mon compte/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/requis|invalide|minimum/i).length).toBeGreaterThan(0)
    })
    expect(trackSignupStarted).not.toHaveBeenCalled()
  })
})
