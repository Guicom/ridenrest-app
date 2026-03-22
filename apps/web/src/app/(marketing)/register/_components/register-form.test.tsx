import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { RegisterForm } from './register-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signUp: { email: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}))

vi.mock('@/components/shared/google-sign-in-button', () => ({
  GoogleSignInButton: () => <button>Google</button>,
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
