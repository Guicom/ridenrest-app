'use client'

import { useState, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAccount } from '../actions'

interface DeleteAccountDialogProps {
  userEmail: string
}

export function DeleteAccountDialog({ userEmail }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, startDelete] = useTransition()

  const emailMatches = emailInput === userEmail

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        setOpen(false)
        setEmailInput('')
        setError(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, isDeleting])

  const handleDelete = () => {
    setError(null)
    startDelete(async () => {
      const result = await deleteAccount(emailInput)
      if (result?.error) {
        setError(result.error)
      }
      // On success: server action redirects to '/' — no client-side redirect needed
    })
  }

  if (!open) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Supprimer mon compte
      </Button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div className="bg-background rounded-lg border p-6 w-full max-w-[calc(100%-2rem)] sm:min-w-[480px] sm:max-w-lg space-y-4">
        <div className="space-y-1">
          <h3 id="delete-dialog-title" className="text-lg font-semibold">Supprimer mon compte</h3>
          <p className="text-sm text-muted-foreground">
            Cette action est <strong>irréversible</strong>. Toutes vos aventures, segments et données seront définitivement effacés.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-email">
            Tapez votre email pour confirmer :{' '}
            <span className="font-mono text-xs">{userEmail}</span>
          </Label>
          <Input
            id="confirm-email"
            type="email"
            placeholder={userEmail}
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            autoComplete="off"
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => { setOpen(false); setEmailInput(''); setError(null) }}
            disabled={isDeleting}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="flex-1"
            onClick={handleDelete}
            disabled={!emailMatches || isDeleting}
          >
            {isDeleting ? 'Suppression...' : 'Supprimer définitivement'}
          </Button>
        </div>
      </div>
    </div>
  )
}
