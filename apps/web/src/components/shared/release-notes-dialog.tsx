'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { currentRelease } from '@/lib/changelog'

interface ReleaseNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReleaseNotesDialog({ open, onOpenChange }: ReleaseNotesDialogProps) {
  if (!currentRelease) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>Nouveautés — v{currentRelease.version}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {currentRelease.sections.map((section, i) => (
            <div key={`${section.title}-${i}`}>
              <h3 className="text-sm font-semibold mb-1.5">{section.title}</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {section.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Compris
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
