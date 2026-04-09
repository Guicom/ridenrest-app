import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReleaseNotesDialog } from './release-notes-dialog'

vi.mock('@/lib/changelog', () => ({
  currentRelease: {
    version: '1.0.0',
    date: '2026-04-09',
    sections: [
      {
        title: 'Nouveautés',
        items: ['Feature A', 'Feature B'],
      },
      {
        title: 'Corrections',
        items: ['Bug fix C'],
      },
    ],
  },
}))

describe('ReleaseNotesDialog', () => {
  it('displays title with version', () => {
    render(<ReleaseNotesDialog open onOpenChange={() => {}} />)

    expect(screen.getByText('Nouveautés — v1.0.0')).toBeInTheDocument()
  })

  it('displays non-empty sections with their items', () => {
    render(<ReleaseNotesDialog open onOpenChange={() => {}} />)

    // Section headings are rendered as h3
    const headings = screen.getAllByRole('heading', { level: 3 })
    const headingTexts = headings.map((h) => h.textContent)
    expect(headingTexts).toContain('Nouveautés')
    expect(headingTexts).toContain('Corrections')

    // Items are rendered (may appear in both portal and original mount)
    expect(screen.getAllByText('Feature A').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Feature B').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Bug fix C').length).toBeGreaterThanOrEqual(1)
  })

  it('calls onOpenChange(false) when "Compris" is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(<ReleaseNotesDialog open onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: 'Compris' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
