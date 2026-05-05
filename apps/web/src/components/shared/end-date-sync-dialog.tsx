'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface EndDateSyncDialogProps {
  proposedDate: string | null
  onConfirm: () => void
  onDismiss: () => void
  isPending?: boolean
}

export function EndDateSyncDialog({ proposedDate, onConfirm, onDismiss, isPending }: EndDateSyncDialogProps) {
  const formattedDate = proposedDate
    ? new Date(proposedDate + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

  return (
    <AlertDialog open={!!proposedDate} onOpenChange={(open) => { if (!open) onDismiss() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mettre à jour la date de fin ?</AlertDialogTitle>
          <AlertDialogDescription>
            La dernière étape arrive le <strong>{formattedDate}</strong>. Voulez-vous mettre à jour la date de fin de l&apos;aventure ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDismiss}>Ignorer</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Mise à jour…' : 'Mettre à jour'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
