import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { toast } from 'sonner'

afterEach(cleanup)

vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

const MOBILE_WIDTH = 375
const DESKTOP_WIDTH = 1280

describe('PlanningMobileToast', () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear()
  })

  it('fires toast on mobile (width < 1024)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: MOBILE_WIDTH })
    const { PlanningMobileToast } = await import('./planning-mobile-toast')
    render(<PlanningMobileToast />)
    expect(toast).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast).mock.calls[0][0]).toContain('Mode Planning optimisé pour desktop')
    expect(vi.mocked(toast).mock.calls[0][1]).toMatchObject({ duration: 6000 })
  })

  it('does NOT fire toast on desktop (width >= 1024)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: DESKTOP_WIDTH })
    const { PlanningMobileToast } = await import('./planning-mobile-toast')
    render(<PlanningMobileToast />)
    expect(toast).not.toHaveBeenCalled()
  })

  it('renders null (no DOM node)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: MOBILE_WIDTH })
    const { PlanningMobileToast } = await import('./planning-mobile-toast')
    const { container } = render(<PlanningMobileToast />)
    expect(container.firstChild).toBeNull()
  })
})
