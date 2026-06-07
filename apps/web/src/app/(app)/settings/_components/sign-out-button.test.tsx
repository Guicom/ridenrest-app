import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import posthog from 'posthog-js'
import { SignOutButton } from './sign-out-button'

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    reset: vi.fn(),
  },
}))

const { mockSignOut, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('@/lib/auth/client', () => ({
  authClient: { signOut: mockSignOut },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

describe('SignOutButton', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue(undefined)
  })

  it('déconnecte puis reset la session analytics (posthog.reset)', async () => {
    const user = userEvent.setup()
    render(<SignOutButton />)

    await user.click(screen.getByRole('button', { name: /se déconnecter/i }))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce()
      expect(posthog.reset).toHaveBeenCalledOnce()
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  it('reset analytics appelé APRÈS le signOut', async () => {
    const callOrder: string[] = []
    mockSignOut.mockImplementation(async () => { callOrder.push('signOut') })
    vi.mocked(posthog.reset).mockImplementation(() => { callOrder.push('reset') })

    const user = userEvent.setup()
    render(<SignOutButton />)
    await user.click(screen.getByRole('button', { name: /se déconnecter/i }))

    await waitFor(() => {
      expect(callOrder).toEqual(['signOut', 'reset'])
    })
  })
})
