import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PwaInstallBanner } from './pwa-install-banner'

// Mock useIsPwaInstalled
vi.mock('@/hooks/use-is-pwa-installed', () => ({
  useIsPwaInstalled: vi.fn(),
}))

// Mock pwa-utils
vi.mock('@/lib/pwa-utils', () => ({
  isMobileViewport: vi.fn(),
}))

import { useIsPwaInstalled } from '@/hooks/use-is-pwa-installed'
import { isMobileViewport } from '@/lib/pwa-utils'

const mockUseIsPwaInstalled = useIsPwaInstalled as ReturnType<typeof vi.fn>
const mockIsMobile = isMobileViewport as ReturnType<typeof vi.fn>

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

describe('PwaInstallBanner', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    mockUseIsPwaInstalled.mockReturnValue(false)
    localStorageMock.clear()
    mockIsMobile.mockReturnValue(true)
  })

  it('renders collapsed state on mobile browser', () => {
    render(<PwaInstallBanner />)
    expect(screen.getByTestId('pwa-install-banner')).toBeInTheDocument()
    expect(screen.getByText(/pour une meilleure experience/i)).toBeInTheDocument()
    expect(screen.queryByTestId('pwa-install-instructions')).not.toBeInTheDocument()
  })

  it('does not render on desktop', () => {
    mockIsMobile.mockReturnValue(false)
    render(<PwaInstallBanner />)
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
  })

  it('does not render when installed as PWA', () => {
    mockUseIsPwaInstalled.mockReturnValue(true)
    render(<PwaInstallBanner />)
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
  })

  it('does not render when previously dismissed', () => {
    localStorageMock.setItem('pwa-install-dismissed', 'true')
    render(<PwaInstallBanner />)
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
  })

  it('dismisses and persists to localStorage on close button click', () => {
    render(<PwaInstallBanner />)
    const closeButton = screen.getByRole('button', { name: /fermer/i })
    fireEvent.click(closeButton)
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
    expect(localStorageMock.getItem('pwa-install-dismissed')).toBe('true')
  })

  it('expands to show install instructions on chevron click', () => {
    render(<PwaInstallBanner />)
    const expandButton = screen.getByRole('button', { name: /voir comment installer/i })
    fireEvent.click(expandButton)
    expect(screen.getByTestId('pwa-install-instructions')).toBeInTheDocument()
  })

  it('shows both iOS and Android instructions when expanded', () => {
    render(<PwaInstallBanner />)
    const expandButton = screen.getByRole('button', { name: /voir comment installer/i })
    fireEvent.click(expandButton)
    expect(screen.getByText(/iphone \/ ipad/i)).toBeInTheDocument()
    expect(screen.getByText(/android/i)).toBeInTheDocument()
    expect(screen.getByText(/partager/i)).toBeInTheDocument()
    expect(screen.getByText(/voir plus/i)).toBeInTheDocument()
    expect(screen.getByText(/trois points/i)).toBeInTheDocument()
  })

  it('hides banner when viewport resizes above mobile breakpoint', () => {
    render(<PwaInstallBanner />)
    expect(screen.getByTestId('pwa-install-banner')).toBeInTheDocument()

    // Simulate resize to desktop
    mockIsMobile.mockReturnValue(false)
    fireEvent(window, new Event('resize'))
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
  })

  it('collapses instructions on second chevron click', () => {
    render(<PwaInstallBanner />)
    const expandButton = screen.getByRole('button', { name: /voir comment installer/i })
    fireEvent.click(expandButton)
    expect(screen.getByTestId('pwa-install-instructions')).toBeInTheDocument()
    const collapseButton = screen.getByRole('button', { name: /réduire/i })
    fireEvent.click(collapseButton)
    expect(screen.queryByTestId('pwa-install-instructions')).not.toBeInTheDocument()
  })
})
