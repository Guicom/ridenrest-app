import { describe, it, expect, vi } from 'vitest'

// Mock Next.js dependencies that don't work in Vitest
vi.mock('./globals.css', () => ({}))
vi.mock('next/font/google', () => ({
  Montserrat: () => ({ variable: '--font-montserrat' }),
}))

const { viewport } = await import('./layout')

describe('Root layout viewport', () => {
  it('has viewport-fit=cover for iOS safe areas', () => {
    expect(viewport.viewportFit).toBe('cover')
  })

  it('has width device-width', () => {
    expect(viewport.width).toBe('device-width')
  })

  it('has initialScale 1', () => {
    expect(viewport.initialScale).toBe(1)
  })
})
