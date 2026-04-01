import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackModal } from './feedback-modal'
import * as apiClient from '@/lib/api-client'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api-client', () => ({
  submitFeedback: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(open = true, onOpenChange = vi.fn()) {
  render(
    <FeedbackModal
      open={open}
      onOpenChange={onOpenChange}
      userEmail="test@example.com"
    />,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FeedbackModal', () => {
  describe('renders form with correct fields', () => {
    it('shows category selector, screen field, description textarea, and disabled email input', () => {
      renderModal()

      // Category selector trigger
      expect(screen.getByRole('combobox')).toBeInTheDocument()

      // Screen field
      expect(screen.getByPlaceholderText('Sur quelle page ou fonctionnalité ?')).toBeInTheDocument()

      // Description textarea
      expect(screen.getByPlaceholderText('Décrivez votre retour en détail...')).toBeInTheDocument()

      // Email input (disabled, pre-filled)
      const emailInput = screen.getByDisplayValue('test@example.com')
      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toBeDisabled()
    })
  })

  describe('shows validation error on description < 10 chars', () => {
    it('displays validation error when description is too short', async () => {
      const ue = userEvent.setup()
      renderModal()

      // Open combobox and select category via fireEvent (Radix UI pointer-events workaround)
      fireEvent.click(screen.getByRole('combobox'))
      const bugOption = await screen.findByText('🐛 Bug')
      fireEvent.click(bugOption)

      // Type a short description
      const textarea = screen.getByPlaceholderText('Décrivez votre retour en détail...')
      await ue.type(textarea, 'Too short')

      // Submit
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

      // Validation error should appear
      expect(
        await screen.findByText('La description doit faire au moins 10 caractères'),
      ).toBeInTheDocument()

      expect(apiClient.submitFeedback).not.toHaveBeenCalled()
    })
  })

  describe('calls submitFeedback and shows success toast on valid submit', () => {
    it('submits form successfully and closes modal', async () => {
      const ue = userEvent.setup()
      const onOpenChange = vi.fn()
      vi.mocked(apiClient.submitFeedback).mockResolvedValue(undefined)

      render(
        <FeedbackModal open={true} onOpenChange={onOpenChange} userEmail="test@example.com" />,
      )

      // Open combobox and select category via fireEvent (Radix UI pointer-events workaround)
      fireEvent.click(screen.getByRole('combobox'))
      const bugOption = await screen.findByText('🐛 Bug')
      fireEvent.click(bugOption)

      // Fill description (≥ 10 chars)
      const textarea = screen.getByPlaceholderText('Décrivez votre retour en détail...')
      await ue.type(textarea, 'The map does not load correctly')

      // Submit
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

      // Wait for submission
      await waitFor(() => {
        expect(apiClient.submitFeedback).toHaveBeenCalledWith(
          expect.objectContaining({
            category: 'bug',
            description: 'The map does not load correctly',
          }),
        )
      })

      const { toast } = await import('sonner')
      expect(toast.success).toHaveBeenCalledWith('Merci pour votre retour !')
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
