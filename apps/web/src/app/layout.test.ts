import { describe, it, expect, vi } from 'vitest'

// Mock Next.js dependencies that don't work in Vitest
vi.mock('./globals.css', () => ({}))
vi.mock('next/font/google', () => ({
  Montserrat: () => ({ variable: '--font-montserrat' }),
}))
vi.mock('next-plausible', () => ({
  default: vi.fn(() => null),
}))
vi.mock('@/components/shared/consent-banner', () => ({
  ConsentBanner: vi.fn(() => null),
}))
vi.mock('@/components/shared/theme-provider', () => ({
  ThemeProvider: vi.fn(({ children }) => children),
}))

const { viewport, default: RootLayout } = await import('./layout')
const PlausibleProvider = (await import('next-plausible')).default as unknown as ReturnType<typeof vi.fn>
const { ConsentBanner } = await import('@/components/shared/consent-banner')
const { ThemeProvider } = await import('@/components/shared/theme-provider')

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findElementOfType(element: any, type: unknown): any {
  if (!element || typeof element !== 'object') return null
  if (element.type === type) return element
  if (element.props?.children) {
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children]
    for (const child of children) {
      const found = findElementOfType(child, type)
      if (found) return found
    }
  }
  return null
}

describe('PlausibleProvider in layout', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function findPlausibleElement(element: any): any {
    return findElementOfType(element, PlausibleProvider)
  }

  it('renders PlausibleProvider with same-origin proxied src', () => {
    const tree = RootLayout({ children: null })
    const plausible = findPlausibleElement(tree)
    expect(plausible).not.toBeNull()
    expect(plausible.props.src).toBe('/js/script.outbound-links.pageview-props.tagged-events.js')
  })

  it('sets data-domain via scriptProps', () => {
    const tree = RootLayout({ children: null })
    const plausible = findPlausibleElement(tree)
    expect(plausible.props.scriptProps['data-domain']).toBe('ridenrest.app')
  })

  it('points to same-origin endpoint (proxied by Caddy)', () => {
    const tree = RootLayout({ children: null })
    const plausible = findPlausibleElement(tree)
    expect(plausible.props.src).not.toContain('stats.ridenrest.app')
    expect(plausible.props.src).not.toContain('plausible.io')
    expect(plausible.props.init.endpoint).toBe('/api/event')
  })
})

describe('Dark mode wiring in layout (story MOB-1.2b AC2)', () => {
  it('met suppressHydrationWarning sur <html> (next-themes pose la classe dessus)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree: any = RootLayout({ children: null })
    expect(tree.type).toBe('html')
    expect(tree.props.suppressHydrationWarning).toBe(true)
  })

  it('monte ThemeProvider avec attribute="class", defaultTheme="system", enableSystem', () => {
    const tree = RootLayout({ children: null })
    const provider = findElementOfType(tree, ThemeProvider)
    expect(provider).not.toBeNull()
    expect(provider.props.attribute).toBe('class')
    expect(provider.props.defaultTheme).toBe('system')
    expect(provider.props.enableSystem).toBe(true)
  })

  it('enveloppe le contenu de la page (children) dans ThemeProvider', () => {
    const marker = { type: 'main', props: {} }
    const tree = RootLayout({ children: marker as unknown as Parameters<typeof RootLayout>[0]['children'] })
    const provider = findElementOfType(tree, ThemeProvider)
    expect(findElementOfType(provider, 'main')).not.toBeNull()
  })
})

describe('ConsentBanner in layout (story posthog-1)', () => {
  it('monte la bannière de consentement dans le body (couvre (marketing) et (app))', () => {
    const tree = RootLayout({ children: null })
    expect(findElementOfType(tree, ConsentBanner)).not.toBeNull()
  })

  it('garde PlausibleProvider en parallèle (coexistence durant l’epic)', () => {
    const tree = RootLayout({ children: null })
    expect(findElementOfType(tree, PlausibleProvider)).not.toBeNull()
  })
})
