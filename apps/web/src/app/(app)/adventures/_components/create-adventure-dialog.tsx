'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { createAdventureSchema } from '@ridenrest/shared'
import type { CreateAdventureInput } from '@ridenrest/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { OfflineTooltipWrapper } from '@/components/shared/offline-tooltip-wrapper'

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <OfflineTooltipWrapper>
        <DialogTrigger render={<Button variant="ghost" size="lg" className="rounded-full gap-2 px-6 py-6 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary" />}>
          <Plus className="h-4 w-4" />
          Nouvelle aventure
        </DialogTrigger>
      </OfflineTooltipWrapper>
      <DialogContent>
        <DialogTitle>Nouvelle aventure</DialogTitle>
        <form onSubmit={handleSubmit(handleCreate)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="adventure-name">Nom de l&apos;aventure</Label>
            <Input
              id="adventure-name"
              placeholder="Ex: Desertus Bikus 2026"
              autoFocus
              {...register('name')}
            />
            {errors.name && (
              <p className="text-destructive text-xs">{errors.name.message}</p>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => { setOpen(false); reset() }}
            >
              Annuler
            </Button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
