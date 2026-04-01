import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DensityCategoryDialog } from './density-category-dialog'

afterEach(cleanup)

// Mock accommodation-sub-types to avoid 'use client' directive issues in test env
vi.mock('@/app/(app)/map/[id]/_components/accommodation-sub-types', () => ({
  ACCOMMODATION_SUB_TYPES: [
    { type: 'hotel',      label: 'Hôtel',               icon: '🏨' },
    { type: 'camp_site',  label: 'Camping',              icon: '⛺' },
    { type: 'shelter',    label: 'Refuge / Abri',        icon: '🏠' },
    { type: 'hostel',     label: 'Auberge de jeunesse',  icon: '🛏️' },
    { type: 'guesthouse', label: "Chambre d'hôte",       icon: '🏡' },
  ],
}))

// Mock shadcn Dialog
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    variant?: string
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}))

function renderDialog(props: Partial<React.ComponentProps<typeof DensityCategoryDialog>> = {}) {
  const defaults = {
    open: true,
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
    isLoading: false,
  }
  return render(<DensityCategoryDialog {...defaults} {...props} />)
}

describe('DensityCategoryDialog', () => {
  it('shows explanatory text when dialog is open', () => {
    renderDialog()
    expect(screen.getByText(/L'analyse se base sur la présence d'hébergements/)).toBeInTheDocument()
  })

  it('renders all 5 category chips when dialog opens', () => {
    renderDialog()
    expect(screen.getByText(/Hôtel/)).toBeDefined()
    expect(screen.getByText(/Camping/)).toBeDefined()
    expect(screen.getByText(/Refuge \/ Abri/)).toBeDefined()
    expect(screen.getByText(/Auberge de jeunesse/)).toBeDefined()
    expect(screen.getByText(/Chambre d'hôte/)).toBeDefined()
  })

  it('all chips are active (aria-pressed=true) by default', () => {
    renderDialog()
    const chipButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    expect(chipButtons).toHaveLength(5)
    chipButtons.forEach((btn) => {
      expect(btn.getAttribute('aria-pressed')).toBe('true')
    })
  })

  it('clicking a chip toggles it inactive (aria-pressed=false)', async () => {
    const user = userEvent.setup()
    renderDialog()

    const chipButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    const hotelChip = chipButtons[0]

    await user.click(hotelChip)
    expect(hotelChip.getAttribute('aria-pressed')).toBe('false')
  })

  it('"Lancer l\'analyse" is disabled when 0 categories selected', async () => {
    const user = userEvent.setup()
    renderDialog()

    const chipButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    // Deselect all
    for (const chip of chipButtons) {
      await user.click(chip)
    }

    const launchBtn = screen.getByText(/Lancer l'analyse/)
    expect(launchBtn.closest('button')?.disabled).toBe(true)
  })

  it('calls onConfirm with correct string array when "Lancer l\'analyse" clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderDialog({ onConfirm })

    // Deselect camping (index 1)
    const chipButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    await user.click(chipButtons[1]) // camp_site

    const launchBtn = screen.getByText(/Lancer l'analyse/).closest('button')!
    await user.click(launchBtn)

    expect(onConfirm).toHaveBeenCalledOnce()
    const calledWith: string[] = onConfirm.mock.calls[0][0]
    expect(calledWith).not.toContain('camp_site')
    expect(calledWith).toContain('hotel')
    expect(calledWith).toContain('shelter')
    expect(calledWith).toContain('hostel')
    expect(calledWith).toContain('guesthouse')
  })

  it('resets to all-selected on re-open', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const { rerender } = renderDialog({ onOpenChange })

    // Deselect a chip
    const chipButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    await user.click(chipButtons[0])
    expect(chipButtons[0].getAttribute('aria-pressed')).toBe('false')

    // Close and reopen
    rerender(
      <DensityCategoryDialog
        open={false}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        isLoading={false}
      />,
    )
    rerender(
      <DensityCategoryDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        isLoading={false}
      />,
    )

    const resetChips = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    resetChips.forEach((btn) => {
      expect(btn.getAttribute('aria-pressed')).toBe('true')
    })
  })
})
