'use client'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ACCOMMODATION_SUB_TYPES } from '@/app/(app)/map/[id]/_components/accommodation-sub-types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (categories: string[]) => void
  isLoading?: boolean
}

const ALL_ACCOMMODATION_TYPES = ACCOMMODATION_SUB_TYPES.map(({ type }) => type)

export function DensityCategoryDialog({ open, onOpenChange, onConfirm, isLoading }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_ACCOMMODATION_TYPES))

  // Reset to all-selected whenever dialog opens
  useEffect(() => {
    if (open) setSelected(new Set(ALL_ACCOMMODATION_TYPES))
  }, [open])

  const toggle = (type: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catégories à analyser</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Sélectionne les types d&apos;hébergements à inclure dans l&apos;analyse de densité.
        </p>
        <div className="flex flex-wrap gap-2 py-2">
          {ACCOMMODATION_SUB_TYPES.map(({ type, label, icon }) => {
            const isActive = selected.has(type)
            return (
              <button
                key={type}
                onClick={() => toggle(type)}
                aria-pressed={isActive}
                className={[
                  'text-sm px-3 py-1.5 rounded-full font-medium border',
                  isActive
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'bg-muted text-muted-foreground border-[--border] opacity-60',
                ].join(' ')}
              >
                {icon} {label}
              </button>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" size="lg" className="rounded-full px-6 py-6" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            size="lg"
            className="rounded-full px-6 py-6"
            disabled={selected.size === 0 || isLoading}
            onClick={() => onConfirm([...selected])}
          >
            {isLoading ? 'Lancement…' : "Lancer l'analyse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
