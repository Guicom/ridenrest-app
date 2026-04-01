import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { SectionTooltip } from './section-tooltip'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SectionTooltip', () => {
  it('renders children without crash', () => {
    render(
      <SectionTooltip content="Tooltip text">
        <div>Section header</div>
      </SectionTooltip>,
    )
    expect(screen.getByText('Section header')).toBeInTheDocument()
  })

  it('tooltip content is accessible in DOM after mouseenter', async () => {
    render(
      <SectionTooltip content="Tooltip text">
        <div>Section header</div>
      </SectionTooltip>,
    )
    const trigger = screen.getByRole('button')

    await act(async () => {
      fireEvent.mouseEnter(trigger)
    })

    expect(screen.getByText('Tooltip text')).toBeInTheDocument()
  })

  it('long-press fires setOpen(true) after 500ms on touch', () => {
    vi.useFakeTimers()
    render(
      <SectionTooltip content="Long-press tooltip">
        <div>Touch target</div>
      </SectionTooltip>,
    )
    const trigger = screen.getByRole('button')

    act(() => {
      fireEvent.pointerDown(trigger, { pointerType: 'touch' })
    })

    // Before 500ms — tooltip should not be open yet
    act(() => { vi.advanceTimersByTime(499) })
    expect(screen.queryByText('Long-press tooltip')).not.toBeInTheDocument()

    // After 500ms — tooltip should open
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByText('Long-press tooltip')).toBeInTheDocument()
  })
})
