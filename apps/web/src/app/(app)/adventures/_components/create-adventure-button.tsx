'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createAdventure } from '@/lib/api-client'
import { CreateAdventureDialog } from './create-adventure-dialog'

export function CreateAdventureButton() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (name: string) => createAdventure(name),
    onSuccess: (adventure) => {
      queryClient.invalidateQueries({ queryKey: ['adventures'] })
      router.push(`/adventures/${adventure.id}`)
    },
  })

  return (
    <CreateAdventureDialog
      onSubmit={(name) => createMutation.mutate(name)}
      isPending={createMutation.isPending}
    />
  )
}
