'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createAdventureSchema } from '@ridenrest/shared'
import type { CreateAdventureInput } from '@ridenrest/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  onSubmit: (name: string) => void
  isPending: boolean
}

export function CreateAdventureDialog({ onSubmit, isPending }: Props) {
  const [open, setOpen] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAdventureInput>({
    resolver: zodResolver(createAdventureSchema),
  })

  const handleCreate = (values: CreateAdventureInput) => {
    onSubmit(values.name)
    reset()
    setOpen(false)
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full">
        + Nouvelle aventure
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit(handleCreate)} className="border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">Nouvelle aventure</h2>
      <div className="space-y-1">
        <Label htmlFor="adventure-name">Nom de l&apos;aventure</Label>
        <Input
          id="adventure-name"
          placeholder="Ex: Transcantabrique 2026"
          autoFocus
          {...register('name')}
        />
        {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Création...' : 'Créer'}
        </Button>
        <Button type="button" variant="outline" onClick={() => { setOpen(false); reset() }}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
