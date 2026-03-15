import { describe, it, expect } from 'vitest'
import { shouldPoll } from './adventure-detail'

describe('shouldPoll', () => {
  it('returns true when any segment is pending', () => {
    expect(shouldPoll([{ parseStatus: 'pending' }, { parseStatus: 'done' }])).toBe(true)
  })

  it('returns true when any segment is processing', () => {
    expect(shouldPoll([{ parseStatus: 'processing' }])).toBe(true)
  })

  it('returns false when all done', () => {
    expect(shouldPoll([{ parseStatus: 'done' }, { parseStatus: 'done' }])).toBe(false)
  })

  it('returns false when all error', () => {
    expect(shouldPoll([{ parseStatus: 'error' }])).toBe(false)
  })

  it('returns false when mix of done and error', () => {
    expect(shouldPoll([{ parseStatus: 'done' }, { parseStatus: 'error' }])).toBe(false)
  })

  it('returns false when no segments', () => {
    expect(shouldPoll([])).toBe(false)
  })
})
