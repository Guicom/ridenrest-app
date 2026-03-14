import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetSession, mockTransaction, mockRevalidatePath, mockRedirect } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockTransaction: vi.fn(),
    mockRevalidatePath: vi.fn(),
    mockRedirect: vi.fn(),
  }))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/auth/auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}))
vi.mock('@ridenrest/database', () => ({
  authDb: { transaction: mockTransaction },
  profiles: {},
  account: {},
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }))

describe('disconnectStrava', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const { disconnectStrava } = await import('./actions')
    await disconnectStrava()
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('runs transaction and returns success when authenticated', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } })
    mockTransaction.mockResolvedValue(undefined)

    const { disconnectStrava } = await import('./actions')
    const result = await disconnectStrava()

    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings')
    expect(result).toEqual({ success: true })
  })

  it('returns error object when transaction throws', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } })
    mockTransaction.mockRejectedValue(new Error('DB connection lost'))

    const { disconnectStrava } = await import('./actions')
    const result = await disconnectStrava()

    expect(mockRevalidatePath).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      error: 'Impossible de déconnecter Strava. Réessaie dans quelques instants.',
    })
  })
})
