import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiClient from '@/lib/api-client'
import { RoutingProfileSelector } from './routing-profile-selector'
import type { AdventureResponse } from '@ridenrest/shared'

vi.mock('@/lib/api-client')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The shadcn `Select` is built on Base UI, whose floating popup does not select
// reliably under jsdom (the real popup label-while-closed behaviour is verified
// manually — Task 7). We mock it to a native <select> so these tests exercise
// THIS component's logic deterministically: profile→label mapping, value binding,
// the mutation call, optimistic rollback, toasts, and the no-op guard.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    disabled?: boolean
    children: React.ReactNode
    items?: unknown
  }) =>
    React.createElement(
      'select',
      {
        role: 'combobox',
        'aria-label': 'Profil de routage cyclable',
        value,
        disabled,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value),
      },
      children,
    ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) =>
    React.createElement('option', { value }, children),
}))

import { toast } from 'sonner'

const ADVENTURE_KEY = ['adventures', 'adv-1'] as const

function makeAdventure(overrides: Partial<AdventureResponse> = {}): AdventureResponse {
  return {
    id: 'adv-1',
    userId: 'user-1',
    name: 'Test',
    totalDistanceKm: 0,
    status: 'planning',
    densityStatus: 'idle',
    densityProgress: 0,
    avgSpeedKmh: 15,
    routingProfile: 'gravel',
    hasStravaSegment: false,
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  }
}

function renderSelector(currentProfile: AdventureResponse['routingProfile'] = 'gravel') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(ADVENTURE_KEY, makeAdventure({ routingProfile: currentProfile }))
  const utils = render(
    <QueryClientProvider client={client}>
      <RoutingProfileSelector adventureId="adv-1" currentProfile={currentProfile} />
    </QueryClientProvider>,
  )
  return { client, ...utils }
}

const selectEl = () => screen.getByRole('combobox') as HTMLSelectElement

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('RoutingProfileSelector', () => {
  it('renders the three profiles with their shared labels', () => {
    renderSelector('gravel')
    expect(screen.getByRole('option', { name: 'Route' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gravel (par défaut)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bikepacking' })).toBeInTheDocument()
  })

  it('binds the current profile as the selected value (AC1)', () => {
    renderSelector('road')
    expect(selectEl().value).toBe('road')
    expect((screen.getByRole('option', { name: 'Route' }) as HTMLOptionElement).selected).toBe(true)
    expect(screen.getByText('Profil de routage cyclable')).toBeInTheDocument()
  })

  it('calls the mutation with the selected profile and shows a success toast (AC2)', async () => {
    vi.mocked(apiClient.updateAdventureRoutingProfile).mockResolvedValue(
      makeAdventure({ routingProfile: 'bikepacking' }),
    )
    renderSelector('gravel')

    fireEvent.change(selectEl(), { target: { value: 'bikepacking' } })

    await waitFor(() => {
      expect(apiClient.updateAdventureRoutingProfile).toHaveBeenCalledWith('adv-1', 'bikepacking')
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Profil de routage mis à jour')
    })
  })

  it('invalidates poi-access queries on success', async () => {
    vi.mocked(apiClient.updateAdventureRoutingProfile).mockResolvedValue(
      makeAdventure({ routingProfile: 'road' }),
    )
    const { client } = renderSelector('gravel')
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    fireEvent.change(selectEl(), { target: { value: 'road' } })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['poi-access'] })
    })
  })

  it('optimistically updates then rolls back the cached profile on failure (AC2)', async () => {
    vi.mocked(apiClient.updateAdventureRoutingProfile).mockRejectedValue(new Error('network'))
    const { client } = renderSelector('gravel')

    fireEvent.change(selectEl(), { target: { value: 'bikepacking' } })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Échec de la sauvegarde du profil de routage')
    })
    // Cache reverted to the previous value after the failed mutation.
    expect(client.getQueryData<AdventureResponse>(ADVENTURE_KEY)?.routingProfile).toBe('gravel')
  })

  it('does not call the mutation when the same profile is re-selected', async () => {
    renderSelector('gravel')
    fireEvent.change(selectEl(), { target: { value: 'gravel' } })

    await new Promise((r) => setTimeout(r, 0))
    expect(apiClient.updateAdventureRoutingProfile).not.toHaveBeenCalled()
  })
})
