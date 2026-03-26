import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MapStylePicker } from './map-style-picker'

afterEach(cleanup)

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockMapStyle = 'liberty'
const mockSetMapStyle = vi.fn()

vi.mock('@/stores/prefs.store', () => ({
  usePrefsStore: () => ({
    mapStyle: mockMapStyle,
    setMapStyle: mockSetMapStyle,
  }),
}))

// Mock Radix Popover — render trigger and content unconditionally to avoid portal issues in jsdom
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, ...props }: Record<string, unknown>) => (
    <button data-testid="popover-trigger" {...props}>{children as React.ReactNode}</button>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MapStylePicker', () => {
  beforeEach(() => {
    mockMapStyle = 'liberty'
    mockSetMapStyle.mockClear()
  })

  it('renders the trigger button with Layers icon aria-label', () => {
    render(<MapStylePicker />)
    const trigger = screen.getByLabelText('Choisir le style de carte')
    expect(trigger).toBeDefined()
  })

  it('renders all 4 style options', () => {
    render(<MapStylePicker />)
    expect(screen.getByText('Liberty')).toBeDefined()
    expect(screen.getByText('Bright')).toBeDefined()
    expect(screen.getByText('Positron')).toBeDefined()
    expect(screen.getByText('Dark')).toBeDefined()
  })

  it('active style has bg-primary class', () => {
    mockMapStyle = 'bright'
    render(<MapStylePicker />)
    const brightBtn = screen.getByText('Bright').closest('button')!
    expect(brightBtn.className).toContain('bg-primary')
  })

  it('inactive style does not have bg-primary class', () => {
    mockMapStyle = 'liberty'
    render(<MapStylePicker />)
    const darkBtn = screen.getByText('Dark').closest('button')!
    expect(darkBtn.className).not.toContain('bg-primary')
  })

  it('calls setMapStyle when a style option is clicked', () => {
    render(<MapStylePicker />)
    fireEvent.click(screen.getByText('Dark').closest('button')!)
    expect(mockSetMapStyle).toHaveBeenCalledWith('dark')
  })

  it('applies custom className to the trigger', () => {
    render(<MapStylePicker className="top-4 right-4 bottom-auto" />)
    const trigger = screen.getByLabelText('Choisir le style de carte')
    expect(trigger.className).toContain('top-4')
    expect(trigger.className).toContain('right-4')
    expect(trigger.className).toContain('bottom-auto')
  })
})
