import { describe, it, expect, beforeEach } from 'vitest'
import { makeQueryClient, getQueryClient } from './query-client'

describe('makeQueryClient', () => {
  it('creates a QueryClient with correct default options', () => {
    const client = makeQueryClient()
    const defaults = client.getDefaultOptions().queries
    expect(defaults?.staleTime).toBe(60 * 1000)
    expect(defaults?.gcTime).toBe(10 * 60 * 1000)
    expect(defaults?.retry).toBe(1)
    expect(defaults?.refetchOnWindowFocus).toBe(false)
  })
})

describe('getQueryClient', () => {
  it('returns a QueryClient instance', () => {
    const client = getQueryClient()
    expect(client).toBeDefined()
    expect(typeof client.getQueryCache).toBe('function')
  })

  it('returns a singleton in browser environment', () => {
    const c1 = getQueryClient()
    const c2 = getQueryClient()
    expect(c1).toBe(c2)
  })
})
