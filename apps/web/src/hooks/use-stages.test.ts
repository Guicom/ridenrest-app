import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStages } from './use-stages'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const mockRefetchQueries = vi.fn().mockResolvedValue(undefined)

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ refetchQueries: mockRefetchQueries }),
}))

vi.mock('@/lib/api-client', () => ({
  getStages: vi.fn(),
  createStage: vi.fn(),
  updateStage: vi.fn(),
  deleteStage: vi.fn(),
}))

const defaultMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) }

describe('useStages', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
    mockUseMutation.mockReset()
    mockRefetchQueries.mockReset()
    mockRefetchQueries.mockResolvedValue(undefined)
    mockUseMutation.mockReturnValue(defaultMutation)
  })

  it('returns empty array when no stages', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    const { result } = renderHook(() => useStages('adv-1'))

    expect(result.current.stages).toEqual([])
    expect(result.current.isPending).toBe(false)
  })

  it('returns stages from query data', () => {
    const mockStages = [
      { id: 's1', adventureId: 'adv-1', name: 'Stage 1', color: '#f97316', orderIndex: 0, startKm: 0, endKm: 50, distanceKm: 50, createdAt: '', updatedAt: '' },
    ]
    mockUseQuery.mockReturnValue({ data: mockStages, isPending: false })

    const { result } = renderHook(() => useStages('adv-1'))

    expect(result.current.stages).toHaveLength(1)
    expect(result.current.stages[0].name).toBe('Stage 1')
  })

  it('uses correct query key [adventures, adventureId, stages]', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    renderHook(() => useStages('adv-42'))

    const { queryKey } = mockUseQuery.mock.calls[0][0]
    expect(queryKey).toEqual(['adventures', 'adv-42', 'stages'])
  })

  it('refetches query on create success and calls onAfterChange', async () => {
    mockUseQuery.mockReturnValue({ data: [], isPending: false })
    mockUseMutation.mockReturnValue(defaultMutation)
    const onAfterChange = vi.fn()

    renderHook(() => useStages('adv-1', { onAfterChange }))

    const { onSuccess } = mockUseMutation.mock.calls[0][0]
    await onSuccess()
    expect(mockRefetchQueries).toHaveBeenCalledWith({ queryKey: ['adventures', 'adv-1', 'stages'] })
    expect(onAfterChange).toHaveBeenCalled()
  })

  it('refetches query on delete success and calls onAfterChange', async () => {
    mockUseQuery.mockReturnValue({ data: [], isPending: false })
    mockUseMutation.mockReturnValue(defaultMutation)
    const onAfterChange = vi.fn()

    renderHook(() => useStages('adv-1', { onAfterChange }))

    // Third useMutation call is for delete
    const { onSuccess } = mockUseMutation.mock.calls[2][0]
    await onSuccess()
    expect(mockRefetchQueries).toHaveBeenCalledWith({ queryKey: ['adventures', 'adv-1', 'stages'] })
    expect(onAfterChange).toHaveBeenCalled()
  })

  it('does not call onAfterChange when not provided', async () => {
    mockUseQuery.mockReturnValue({ data: [], isPending: false })
    mockUseMutation.mockReturnValue(defaultMutation)

    renderHook(() => useStages('adv-1'))

    const { onSuccess } = mockUseMutation.mock.calls[0][0]
    await expect(onSuccess()).resolves.not.toThrow()
  })

  it('query is disabled when adventureId is empty string', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    renderHook(() => useStages(''))

    const { enabled } = mockUseQuery.mock.calls[0][0]
    expect(enabled).toBe(false)
  })
})
