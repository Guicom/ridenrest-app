import { describe, it, expect, vi } from 'vitest'

// Mock Next.js dependencies that don't work in Vitest
vi.mock('./globals.css', () => ({}))
vi.mock('next/font/google', () => ({
  Montserrat: () => ({ variable: '--font-montserrat' }),
}))
vi.mock('next-plausible', () => ({
  default: vi.fn(() => null),
}))

const { viewport, default: RootLayout } = await import('./layout')
const PlausibleProvider = (await import('next-plausible')).default as unknown as ReturnType<typeof vi.fn>

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

describe('PlausibleProvider in layout', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function findPlausibleElement(element: any): any {
    if (!element || typeof element !== 'object') return null
    if (element.type === PlausibleProvider) return element
    if (element.props?.children) {
      const children = Array.isArray(element.props.children)
        ? element.props.children
        : [element.props.children]
      for (const child of children) {
        const found = findPlausibleElement(child)
        if (found) return found
      }
    }
    return null
  }

  it('renders PlausibleProvider with self-hosted src', () => {
    const tree = RootLayout({ children: null })
    const plausible = findPlausibleElement(tree)
    expect(plausible).not.toBeNull()
    expect(plausible.props.src).toContain('stats.ridenrest.app/js/script.')
  })

  it('sets data-domain via scriptProps', () => {
    const tree = RootLayout({ children: null })
    const plausible = findPlausibleElement(tree)
    expect(plausible.props.scriptProps['data-domain']).toBe('ridenrest.app')
  })

  it('points to self-hosted endpoint, not plausible.io', () => {
    const tree = RootLayout({ children: null })
    const plausible = findPlausibleElement(tree)
    expect(plausible.props.src).not.toContain('plausible.io')
    expect(plausible.props.init.endpoint).toContain('stats.ridenrest.app')
    expect(plausible.props.init.endpoint).not.toContain('plausible.io')
  })
})
